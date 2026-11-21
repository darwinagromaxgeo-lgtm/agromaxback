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

test('product eligibility persists with legacy defaults and blocks fiscal sales before operational writes', { timeout: 90000 }, async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'agromax-product-billing-'));
  fs.mkdirSync(path.join(temporary, 'db'));
  const processes = [], descriptors = [];
  const launch = (name, command, args, options = {}) => {
    const log = fs.openSync(path.join(temporary, `${name}.log`), 'a', 0o600); descriptors.push(log);
    const child = spawn(command, args, { ...options, stdio: ['ignore', log, log] }); processes.push(child); return child;
  };
  let connection;
  try {
    const mongoPort = await freePort(), appPort = await freePort();
    const uri = `mongodb://127.0.0.1:${mongoPort}/agromax_mvp_productbilling?directConnection=true`;
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
    const oid = value => new mongoose.Types.ObjectId(id(value));
    const payload = { name: 'Producto nuevo', categoryId: id(8004), unit: 'UND', taxType: 'GRAVADO' };
    const enabled = await request('POST', '/products', payload);
    assert.equal(enabled.billingEnabled, true);
    const restricted = await request('POST', '/products', { ...payload, name: 'Solo nota de venta', billingEnabled: false });
    assert.equal(restricted.billingEnabled, false);
    assert.equal((await request('GET', '/products?billingEnabled=true')).data.find(p => p.id === id(8010)).billingEnabled, true, 'Legacy products stay enabled');
    assert.ok((await request('GET', '/products?billingEnabled=false')).data.some(p => p.id === restricted.id));
    assert.ok(!(await request('GET', '/products?billingEnabled=true')).data.some(p => p.id === restricted.id));
    for (const value of [null, 'false', 0]) await request('PUT', '/products/'+restricted.id, { billingEnabled: value }, 400);
    await request('GET', '/products?billingEnabled=garbage', undefined, 400);
    await request('PUT', '/products/'+id(8010), { billingEnabled: false });
    await request('PUT', '/products/'+id(8010), { description: 'Edición sin cambiar habilitación' });
    assert.equal((await request('GET','/products?billingEnabled=false')).data.find(p=>p.id===id(8010)).billingEnabled,false);
    const item = { productId:id(8010), companyId:id(8001), quantity:1, priceTier:id(8005), unitPrice:118 };
    const payment = { paymentMethodId:id(8006), amount:118 };
    const before = async () => ({ sales:await db.collection('sales').find().toArray(), stocks:await db.collection('stocks').find().toArray(), registers:await db.collection('cash_registers').find().toArray(), notes:await db.collection('sale_note_counters').find().toArray() });
    const snapshot = await before();
    for (const voucherType of ['BOLETA','FACTURA']) {
      await request('POST','/sales',{voucherType,items:[item],payments:[payment]},400);
      await request('POST','/sales',{voucherType,items:[{...item,productId:id(8011),unitPrice:50},item],payments:[{...payment,amount:168}]},400);
      assert.deepEqual(await before(), snapshot, 'Rejected fiscal sales cannot change stock, cash or counters');
    }
    const quote = await request('POST','/quotes',{companyId:id(8001),clientName:'Cliente de prueba',items:[item]});
    assert.equal((await request('GET','/quotes/'+quote.id)).items[0].billingEnabled,false);
    await request('POST','/quotes/'+quote.id+'/convert',{voucherType:'FACTURA',payments:[payment]},400);
    assert.equal((await request('GET','/quotes/'+quote.id)).status,'PENDING');
    assert.deepEqual(await before(), snapshot);
    const sale = await request('POST','/quotes/'+quote.id+'/convert',{voucherType:'NONE',payments:[payment]});
    assert.equal(sale.voucherType,'NONE'); assert.equal(sale.total,118);
    assert.equal((await db.collection('stocks').findOne({product:oid(8010)})).quantity,99);
    await request('PATCH','/sales/'+sale.id+'/voucher',{voucherType:'BOLETA'},400);
    await request('PATCH','/sales/'+sale.id+'/voucher',{voucherType:'FACTURA'},400);
    assert.equal((await request('GET','/sales/'+sale.id)).voucherType,'NONE');
    const seller=await request('POST','/users',{username:'product-seller',password:'test-only-password',fullName:'Vendedor',role:'VENDEDOR',branchAssignments:[{branchId:id(8002),role:'VENDEDOR'}]});
    const {JwtService}=require('@nestjs/jwt'); const jwt=new JwtService({secret:jwtSecret});
    authorization='Bearer '+jwt.sign({sub:seller.id,username:seller.username,role:'VENDEDOR'});
    await request('PUT','/products/'+id(8010),{billingEnabled:true},403);
    authorization=adminAuthorization;
    await request('PUT','/products/'+id(8010),{billingEnabled:true});
    const fiscal = await request('POST','/sales',{voucherType:'BOLETA',items:[item],payments:[payment]});
    assert.equal(fiscal.voucherType,'BOLETA');
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
