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

test('sellers sell and reconcile their branch cash while administrative actions and other branches are protected', { timeout: 90000 }, async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'agromax-seller-access-'));
  fs.mkdirSync(path.join(temporary, 'db'));
  const processes = [], descriptors = [];
  const launch = (name, command, args, options = {}) => {
    const log = fs.openSync(path.join(temporary, `${name}.log`), 'a', 0o600); descriptors.push(log);
    const child = spawn(command, args, { ...options, stdio: ['ignore', log, log] }); processes.push(child); return child;
  };
  let connection;
  try {
    const mongoPort = await freePort(), appPort = await freePort();
    const uri = `mongodb://127.0.0.1:${mongoPort}/agromax_mvp_selleraccess?directConnection=true`;
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
    const branchTemplate = await db.collection('branches').findOne({ _id: new mongoose.Types.ObjectId(id(8002)) });
    await db.collection('branches').insertOne({ ...branchTemplate, _id: new mongoose.Types.ObjectId(id(8100)), code: 'OTHER', name: 'Sucursal no asignada', billingSeriesCode: '9', isMain: false });
    const foreignRegister = await request('POST', '/cash-registers/open', { openingBalance: 777 }, 201, id(8100));
    const seller = await request('POST', '/users', { username: 'price-seller', password: 'synthetic-seller-password', fullName: 'Vendedor sintético', role: 'VENDEDOR', branchAssignments: [{ branchId: id(8002), role: 'VENDEDOR' }] });
    const { JwtService } = require('@nestjs/jwt');
    const jwt = new JwtService({ secret: jwtSecret });
    const sellerAuthorization = `Bearer ${jwt.sign({ sub: seller.id, username: seller.username, role: 'VENDEDOR' })}`;
    authorization = sellerAuthorization;
    const denied = [
      ['GET', '/dashboard/summary'], ['GET', '/dashboard/financial-overview'],
      ['POST', `/cash-registers/${id(9000)}/entries`, {}],
      ['PATCH', `/cash-registers/${id(9000)}/entries/${id(9001)}`, {}],
      ['DELETE', `/cash-registers/${id(9000)}/entries/${id(9001)}`, {}],
      ['PATCH', `/cash-registers/${id(9000)}/opening-balance`, {}],
      ['GET', '/purchases'], ['POST', '/purchases', {}], ['GET', '/accounts-payable'],
      ['GET', '/stock-movements'], ['POST', '/stock/transfer', {}],
      ['GET', '/users'], ['GET', '/branches'], ['POST', '/companies', {}],
      ['POST', '/categories', {}], ['POST', '/units', {}], ['POST', '/payment-methods', {}],
      ['GET', '/credits'], ['GET', '/loans'], ['GET', '/products/price-floor-alerts'],
      ['GET', '/billing/credit-notes'], ['POST', '/billing/credit-notes', {}],
      ['DELETE', `/sales/${id(9000)}`, { reason: 'No autorizado' }],
      ['POST', '/product-lots', {}], ['POST', '/stock-adjustments', {}],
    ];
    for (const [method, route, body] of denied) await request(method, route, body, 403);
    assert.equal(await request('GET', '/cash-registers/today'), null);
    let register = await request('POST', '/cash-registers/open', { openingBalance: 100 });
    assert.equal(register.openingBalance, 100);
    assert.equal((await request('GET', '/cash-registers')).data.length, 1);
    assert.equal((await request('GET', '/cash-registers/by-date?date='+register.date)).id, register.id);
    assert.equal((await request('GET', '/cash-registers/'+register.id)).id, register.id);
    for (const route of ['/cash-registers', '/cash-registers/today', '/cash-registers/by-date?date='+register.date, '/cash-registers/'+foreignRegister.id]) await request('GET', route, undefined, 403, id(8100));
    await request('POST', '/cash-registers/open', { openingBalance: 1 }, 403, id(8100));
    await request('POST', '/cash-registers/'+foreignRegister.id+'/close', {}, 403, id(8100));
    assert.equal(await request('GET', '/cash-registers/'+foreignRegister.id), null, 'A foreign register ID cannot bypass the active branch scope');
    await request('POST', '/cash-registers/'+foreignRegister.id+'/close', { countedCash: 777, expectedRevision: foreignRegister.revision }, 400);
    for (const route of ['/auth/me', '/branches/accessible', '/companies', '/categories', '/units', '/price-tiers', '/payment-methods', '/products', `/stock/company/${id(8001)}`, `/stock/branches?companyId=${id(8001)}`, `/stock/availability/${id(8010)}?companyId=${id(8001)}`, `/product-lots?productId=${id(8010)}`, '/clients', '/sales', '/quotes', `/credits/client/${id(8020)}/open`, '/billing/documents']) await request('GET', route);
    const sale = await request('POST', '/sales', { voucherType: 'NONE', items: [{ productId: id(8010), companyId: id(8001), quantity: 1, priceTier: id(8005), unitPrice: 118 }], payments: [{ paymentMethodId: id(8006), amount: 118 }] });
    assert.equal(sale.total, 118, 'Internal cash registration must remain available through a legitimate sale');
    await request('POST', '/clients', { name: 'Cliente sintético del vendedor', documentNumber: '87654321' });
    // A vendor token cannot regain admin permissions through a stale ADMIN role claim.
    authorization = `Bearer ${jwt.sign({ sub: seller.id, username: seller.username, role: 'ADMIN' })}`;
    await request('GET', '/cash-registers/today');
    await request('PATCH', '/cash-registers/'+register.id+'/opening-balance', { openingBalance: 999, reason: 'No autorizado' }, 403);
    authorization = adminAuthorization;
    for (const route of ['/dashboard/summary', '/cash-registers/today', '/purchases', '/accounts-payable', '/users']) await request('GET', route);
    const accounts = await request('GET', '/users?limit=100');
    const before = accounts.data.find(u => u.id === seller.id);
    await request('PUT', '/users/'+seller.id, { role: 'ADMIN', branchAssignments: [] });
    authorization = sellerAuthorization;
    await request('GET', '/cash-registers/today'); // Role changes apply to the already-issued token.
    authorization = adminAuthorization;
    await request('PUT', '/users/'+seller.id, { role: before.role, branchAssignments: before.branchAssignments });
    authorization = sellerAuthorization;
    register = await request('GET', '/cash-registers/today');
    await request('PATCH', '/cash-registers/'+register.id+'/opening-balance', { openingBalance: 999, reason: 'No autorizado' }, 403);
    await request('POST', '/cash-registers/'+register.id+'/close', { countedCash: 217, expectedRevision: register.revision }, 400);
    register = await request('POST', '/cash-registers/'+register.id+'/close', { countedCash: 218, expectedRevision: register.revision, notes: 'Cuadre del vendedor' });
    assert.equal(register.status, 'CLOSED');
    assert.equal(register.cashCount.expectedAmount, 218);
    assert.equal(register.cashCount.countedAmount, 218);
    assert.equal(register.cashCount.difference, 0);
    assert.equal(register.closedBy, seller.id);
    assert.equal((await request('GET', '/cash-registers/'+register.id)).cashCount.difference, 0);
    authorization = adminAuthorization;
    const foreignAfter = await request('GET', '/cash-registers/'+foreignRegister.id, undefined, 200, id(8100));
    assert.equal(foreignAfter.status, 'OPEN');
    assert.equal(foreignAfter.openingBalance, 777);
    await request('PATCH', '/users/'+seller.id+'/toggle-status', {});
    authorization = sellerAuthorization;
    await request('GET', '/auth/me', undefined, 401);
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
