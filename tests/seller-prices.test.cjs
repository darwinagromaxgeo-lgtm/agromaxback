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

const id = number => String(number).padStart(24, '0');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  return port;
}

test('sellers cannot change catalog prices or override a sale price, including requests that bypass the UI', { timeout: 90000 }, async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'agromax-price-permissions-'));
  fs.mkdirSync(path.join(temporary, 'db'));
  const processes = [], descriptors = [];
  const launch = (name, command, args, options = {}) => {
    const log = fs.openSync(path.join(temporary, `${name}.log`), 'a', 0o600); descriptors.push(log);
    const child = spawn(command, args, { ...options, stdio: ['ignore', log, log] }); processes.push(child); return child;
  };
  let connection;
  try {
    const mongoPort = await freePort(), appPort = await freePort();
    const uri = `mongodb://127.0.0.1:${mongoPort}/agromax_mvp_prices?directConnection=true`;
    launch('mongo', process.env.MONGOD_BIN || path.join(os.homedir(), '.cache/agromax-runtime/mongodb/bin/mongod'), ['--dbpath', path.join(temporary, 'db'), '--port', String(mongoPort), '--bind_ip', '127.0.0.1', '--replSet', 'credit-test']);
    for (let attempt = 0; attempt < 60; attempt++) {
      try { connection = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 200 }).asPromise(); break; }
      catch { await delay(100); }
    }
    assert.ok(connection, 'Disposable MongoDB must start');
    const db = connection.db;
    await db.admin().command({ replSetInitiate: { _id: 'credit-test', members: [{ _id: 0, host: `127.0.0.1:${mongoPort}` }] } });
    for (let attempt = 0; attempt < 100; attempt++) {
      if ((await db.admin().command({ hello: 1 })).isWritablePrimary) break;
      await delay(100);
    }
    const password = randomBytes(16).toString('hex');
    await seed({ MVP_MODE: 'true', MONGODB_URI: uri, MVP_ADMIN_PASSWORD: password });
    await db.collection('payment_methods').updateOne({ _id: new mongoose.Types.ObjectId(id(8006)) }, { $set: { name: 'Efectivo' } });
    const jwtSecret = randomBytes(32).toString('hex');
    const backend = path.resolve(__dirname, '..');
    const app = launch('backend', process.execPath, ['dist/main.js'], { cwd: backend, env: { ...process.env, AGROMAX_ENV_FILE: path.join(temporary, 'absent.env'), MONGODB_URI: uri, PORT: String(appPort), JWT_SECRET: jwtSecret, GREENTER_ENABLED: 'false', GREENTER_SIMULATION_ENABLED: 'false', GREENTER_ALLOW_PRODUCTION: 'false', DECOLECTA_API_KEY: '' } });
    for (let attempt = 0; attempt < 150; attempt++) {
      if (app.exitCode !== null) throw new Error(`Test backend exited. Log: ${path.join(temporary, 'backend.log')}`);
      try { if ((await fetch(`http://127.0.0.1:${appPort}/api/health`)).ok) break; } catch {}
      await delay(100);
    }
    let authorization;
    const request = async (method, route, body, expected = method === 'POST' ? 201 : 200, branch = id(8002)) => {
      const response = await fetch(`http://127.0.0.1:${appPort}/api${route}`, { method, headers: { 'Content-Type': 'application/json', 'x-branch-id': branch, ...(authorization ? { Authorization: authorization } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const data = await response.json();
      assert.equal(response.status, expected, `${route}: ${JSON.stringify(data)}`); return data.data;
    };
    authorization = `Bearer ${(await request('POST', '/auth/login', { username: 'mvpadmin', password })).accessToken}`;
    const adminAuthorization = authorization;
    const seller = await request('POST', '/users', { username: 'price-seller', password: 'synthetic-seller-password', fullName: 'Vendedor sintético', role: 'VENDEDOR', branchAssignments: [{ branchId: id(8002), role: 'VENDEDOR' }] });
    const { JwtService } = require('@nestjs/jwt');
    const jwt = new JwtService({ secret: jwtSecret });
    const sellerAuthorization = `Bearer ${jwt.sign({ sub: seller.id, username: seller.username, role: 'VENDEDOR' })}`;
    authorization = sellerAuthorization;
    for (const [method, route, body] of [
      ['POST', '/products', { name: 'NO CREAR', unit: 'UND', categoryId: id(8004), prices: [{ priceTierId: id(8005), price: 1 }] }],
      ['PUT', `/products/${id(8010)}`, { prices: [{ priceTierId: id(8005), price: 1 }] }],
      ['DELETE', `/products/${id(8010)}`],
      ['POST', '/products/import', {}],
      ['POST', `/products/${id(8010)}/image`, {}],
      ['POST', '/price-tiers', { name: 'NO CREAR' }],
      ['PUT', `/price-tiers/${id(8005)}`, { name: 'NO CAMBIAR' }],
      ['POST', '/purchases', {}],
      ['PATCH', `/purchases/${id(9000)}/items`, {}],
    ]) await request(method, route, body, 403);
    const snapshot = async () => {
      const result = {};
      for (const name of ['products', 'stocks', 'sales', 'cash_registers', 'credit_accounts', 'stock_movements', 'quotes']) result[name] = await db.collection(name).find({}).sort({ _id: 1 }).toArray();
      return result;
    };
    const before = await snapshot();
    const sale = { voucherType: 'NONE', items: [{ productId: id(8010), companyId: id(8001), quantity: 1, priceTier: id(8005), unitPrice: 118 }], payments: [{ paymentMethodId: id(8006), amount: 118 }] };
    for (const price of [1, 100, 119, 118.000001]) await request('POST', '/sales', { ...sale, items: [{ ...sale.items[0], unitPrice: price }], payments: [{ paymentMethodId: id(8006), amount: price }] }, 403);
    await request('POST', '/sales', { ...sale, items: [{ ...sale.items[0], priceTier: id(9999) }] }, 403);
    for (const quantity of [-1, 0]) await request('POST', '/sales', { ...sale, items: [{ ...sale.items[0], quantity }] }, 400);
    assert.deepEqual(await snapshot(), before, 'Rejected prices must not alter stock, sales, credits or cash');
    const accepted = await request('POST', '/sales', sale);
    assert.equal(accepted.total, 118);
    authorization = adminAuthorization;
    const custom = await request('POST', '/sales', { ...sale, items: [{ ...sale.items[0], unitPrice: 120 }], payments: [{ paymentMethodId: id(8006), amount: 120 }] });
    assert.equal(custom.total, 120, 'Administrators retain custom prices');
    // A stale ADMIN claim cannot bypass the pricing decision made with the current user record.
    authorization = `Bearer ${jwt.sign({ sub: seller.id, username: seller.username, role: 'ADMIN' })}`;
    await request('POST', '/sales', { ...sale, items: [{ ...sale.items[0], unitPrice: 120 }], payments: [{ paymentMethodId: id(8006), amount: 120 }] }, 403);
    const { configuredSalePrice } = require('../dist/application/services/sale-price-permissions');
    const prices = [
      { priceTierId: 'retail', price: 10 },
      { priceTierId: 'retail', companyId: 'company', price: 20 },
      { priceTierId: 'retail', branchId: 'branch', price: 30 },
      { priceTierId: 'retail', branchId: 'branch', companyId: 'company', price: 40 },
      { priceTierId: 'retail', branchId: 'another-branch', companyId: 'company', price: 1 },
    ];
    for (const [length, expected] of [[4, 40], [3, 30], [2, 20], [1, 10]]) assert.equal(configuredSalePrice({ prices: prices.slice(0, length) }, 'retail', 'company', 'branch'), expected);
    assert.equal(configuredSalePrice({ prices: [prices[4]] }, 'retail', 'company', 'branch'), undefined);
    assert.equal(await db.collection('billing_documents').countDocuments(), 0);
  } finally {
    for (const child of processes.reverse()) {
      if (child.exitCode !== null) continue;
      const ended = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGTERM');
      const timeout = setTimeout(() => child.kill('SIGKILL'), 5000); await ended; clearTimeout(timeout);
    }
    if (connection) await connection.close();
    for (const descriptor of descriptors) fs.closeSync(descriptor);
  }
});
