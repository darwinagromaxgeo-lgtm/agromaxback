const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { randomBytes } = require('node:crypto');
const mongoose = require('mongoose');
const { seed } = require('../scripts/seed-mvp.cjs');

const id = n => String(n).padStart(24, '0');
const oid = n => new mongoose.Types.ObjectId(id(n));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

test('product creation saves the catalog, branch stock and Kardex atomically', { timeout: 90000 }, async t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'agromax-product-creation-'));
  fs.mkdirSync(path.join(temporary, 'db'));
  const processes = [], descriptors = [];
  const launch = (name, command, args, options = {}) => {
    const log = fs.openSync(path.join(temporary, name + '.log'), 'a', 0o600);
    descriptors.push(log);
    const child = spawn(command, args, { ...options, stdio: ['ignore', log, log] });
    processes.push(child);
    return child;
  };
  let connection;
  try {
    const mongoPort = await freePort(), appPort = await freePort();
    const uri = `mongodb://127.0.0.1:${mongoPort}/agromax_mvp_productcreation?directConnection=true`;
    launch('mongo', process.env.MONGOD_BIN || path.join(os.homedir(), '.cache/agromax-runtime/mongodb/bin/mongod'), [
      '--dbpath', path.join(temporary, 'db'), '--port', String(mongoPort), '--bind_ip', '127.0.0.1', '--replSet', 'product-test',
    ]);
    for (let attempt = 0; attempt < 80; attempt++) {
      try { connection = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 200 }).asPromise(); break; }
      catch { await delay(100); }
    }
    assert.ok(connection, 'Disposable MongoDB must start');
    const db = connection.db;
    await db.admin().command({ replSetInitiate: { _id: 'product-test', members: [{ _id: 0, host: `127.0.0.1:${mongoPort}` }] } });
    for (let attempt = 0; attempt < 100; attempt++) {
      if ((await db.admin().command({ hello: 1 })).isWritablePrimary) break;
      await delay(100);
    }
    const password = randomBytes(18).toString('hex');
    await seed({ MVP_MODE: 'true', MONGODB_URI: uri, MVP_ADMIN_PASSWORD: password });
    await db.collection('branches').insertOne({ _id: oid(8100), code: 'OTRA', name: 'Otra sucursal', companies: [oid(8001)], isActive: true });
    await db.collection('companies').insertMany([
      { _id: oid(8200), name: 'Segunda empresa', ruc: '20600000002', isActive: true },
      { _id: oid(8201), name: 'Inactiva', ruc: '20600000003', isActive: false },
      { _id: oid(8202), name: 'No pertenece a la sucursal', ruc: '20600000004', isActive: true },
    ]);
    await db.collection('branches').updateOne({ _id: oid(8002) }, { $set: { companies: [oid(8001), oid(8200), oid(8201), oid(8299)] } });
    const secret = randomBytes(32).toString('hex');
    const app = launch('backend', process.execPath, ['dist/main.js'], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, AGROMAX_ENV_FILE: path.join(temporary, 'absent.env'), MONGODB_URI: uri, PORT: String(appPort), JWT_SECRET: secret,
        GREENTER_ENABLED: 'false', GREENTER_ALLOW_PRODUCTION: 'false', GREENTER_SIMULATION_ENABLED: 'false', DECOLECTA_API_KEY: '' },
    });
    for (let attempt = 0; attempt < 150; attempt++) {
      if (app.exitCode !== null) throw new Error('Backend exited. Log: ' + path.join(temporary, 'backend.log'));
      try { if ((await fetch(`http://127.0.0.1:${appPort}/api/health`)).ok) break; } catch {}
      await delay(100);
    }
    let authorization;
    const request = async (method, route, body, expected = method === 'POST' ? 201 : 200, branch = id(8002)) => {
      const response = await fetch(`http://127.0.0.1:${appPort}/api${route}`, {
        method, headers: { 'Content-Type': 'application/json', ...(branch ? { 'x-branch-id': branch } : {}), ...(authorization ? { Authorization: authorization } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const json = await response.json();
      assert.equal(response.status, expected, `${route}: ${JSON.stringify(json)}; log: ${temporary}/backend.log`);
      return json.data;
    };
    authorization = 'Bearer ' + (await request('POST', '/auth/login', { username: 'mvpadmin', password })).accessToken;
    const adminAuthorization = authorization;
    const payload = {
      name: 'PRODUCTO PRUEBA', description: '', categoryId: id(8004), unit: 'Bolsa', activeIngredients: [], billingEnabled: true,
      initialStocks: [{ companyId: id(8001), quantity: 10 }], location: '',
      prices: [{ priceTierId: id(8005), price: 100 }], taxType: 'GRAVADO', tracksLot: false,
    };
    const snapshot = async () => {
      const result = {};
      for (const collection of ['products', 'stocks', 'stock_movements']) result[collection] = await db.collection(collection).find().sort({ _id: 1 }).toArray();
      return result;
    };
    let created;
    await t.test('the reported payload returns 201 and records 10 units only in the selected branch', async () => {
      created = await request('POST', '/products', payload);
      assert.equal(created.name, payload.name);
      const productId = new mongoose.Types.ObjectId(created.id);
      const stocks = await db.collection('stocks').find({ product: productId }).toArray();
      assert.equal(stocks.length, 1);
      assert.equal(stocks[0].quantity, 10);
      assert.equal(stocks[0].branch.toString(), id(8002));
      assert.equal(stocks[0].company.toString(), id(8001));
      const movements = await db.collection('stock_movements').find({ product: productId }).toArray();
      assert.equal(movements.length, 1);
      assert.equal(movements[0].branch.toString(), id(8002));
      assert.equal(movements[0].company.toString(), id(8001));
      assert.equal(movements[0].user.toString(), id(8003));
      assert.equal(movements[0].referenceId.toString(), created.id);
      assert.equal(movements[0].referenceType, 'InitialStock');
      assert.equal(movements[0].movementType, 'ADJUSTMENT_IN');
      assert.deepEqual([movements[0].previousStock, movements[0].quantity, movements[0].newStock], [0, 10, 10]);
      assert.ok((await request('GET', '/products?search=PRODUCTO%20PRUEBA', undefined, 200, id(8100))).data.some(p => p.id === created.id), 'Catalog remains global');
      assert.equal((await request('GET', '/stock/company/' + id(8001), undefined, 200, id(8100))).data.some(s => s.productId === created.id), false);
    });
    await t.test('retrying a successful name does not duplicate the product or stock', async () => {
      const before = await snapshot();
      await request('POST', '/products', { ...payload, name: 'producto prueba' }, 409);
      assert.deepEqual(await snapshot(), before);
    });
    await t.test('missing or unavailable branches, companies and duplicate company lines cannot leave a product behind', async () => {
      const before = await snapshot();
      const command = { ...payload, name: 'No debe quedar creado' };
      await request('POST', '/products', command, 400, null);
      await request('POST', '/products', command, 404, id(8999));
      for (const companyId of [id(8201), id(8202), id(8299), 'bad-id']) {
        await request('POST', '/products', { ...command, initialStocks: [{ companyId, quantity: 10 }] }, 400);
      }
      await request('POST', '/products', { ...command, initialStocks: [payload.initialStocks[0], payload.initialStocks[0]] }, 400);
      await request('POST', '/products', { ...command, initialStocks: [{ companyId: id(8001), quantity: -1 }] }, 400);
      assert.deepEqual(await snapshot(), before);
    });
    await t.test('products without initial stock do not generate invented stock or audit entries', async () => {
      for (const initialStocks of [undefined, [{ companyId: id(8001), quantity: 0 }]]) {
        const product = await request('POST', '/products', { ...payload, name: 'Sin stock ' + String(initialStocks === undefined), initialStocks });
        const productId = new mongoose.Types.ObjectId(product.id);
        assert.equal(await db.collection('stocks').countDocuments({ product: productId }), 0);
        assert.equal(await db.collection('stock_movements').countDocuments({ product: productId }), 0);
      }
    });
    await t.test('multiple company stocks and their movements commit together', async () => {
      const product = await request('POST', '/products', { ...payload, name: 'Dos empresas', initialStocks: [...payload.initialStocks, { companyId: id(8200), quantity: 2.5 }] });
      const productId = new mongoose.Types.ObjectId(product.id);
      const stocks = await db.collection('stocks').find({ product: productId }).sort({ company: 1 }).toArray();
      assert.deepEqual(stocks.map(s => [s.company.toString(), s.branch.toString(), s.quantity]), [[id(8001), id(8002), 10], [id(8200), id(8002), 2.5]]);
      assert.equal(await db.collection('stock_movements').countDocuments({ product: productId }), 2);
    });
    await t.test('a failure in a later Kardex entry rolls back all earlier writes and permits a clean retry', async () => {
      const command = { ...payload, name: 'Reintento tras fallo', initialStocks: [...payload.initialStocks, { companyId: id(8200), quantity: 2 }] };
      const before = await snapshot();
      await db.command({ collMod: 'stock_movements', validator: { company: { $ne: oid(8200) } } });
      try {
        await request('POST', '/products', command, 500);
        assert.deepEqual(await snapshot(), before);
      } finally { await db.command({ collMod: 'stock_movements', validator: {} }); }
      const product = await request('POST', '/products', command);
      const productId = new mongoose.Types.ObjectId(product.id);
      assert.equal(await db.collection('products').countDocuments({ name: command.name }), 1);
      assert.equal(await db.collection('stocks').countDocuments({ product: productId }), 2);
      assert.equal(await db.collection('stock_movements').countDocuments({ product: productId }), 2);
    });
    await t.test('a seller cannot create products, even with initial stock in the assigned branch', async () => {
      const seller = await request('POST', '/users', { username: 'product-seller', password: 'test-only-password', fullName: 'Vendedor', role: 'VENDEDOR', branchAssignments: [{ branchId: id(8002), role: 'VENDEDOR' }] });
      const { JwtService } = require('@nestjs/jwt');
      authorization = 'Bearer ' + new JwtService({ secret }).sign({ sub: seller.id, username: seller.username, role: 'VENDEDOR' });
      const before = await snapshot();
      await request('POST', '/products', { ...payload, name: 'No autorizado' }, 403);
      assert.deepEqual(await snapshot(), before);
      authorization = adminAuthorization;
    });
  } finally {
    for (const child of processes.reverse()) {
      if (child.exitCode !== null) continue;
      const ended = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 5000); await ended; clearTimeout(timer);
    }
    if (connection) await connection.close();
    for (const descriptor of descriptors) fs.closeSync(descriptor);
  }
});
