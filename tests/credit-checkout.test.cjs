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

test('checkout saves initial credit payments exactly once, preserves branch scope and rolls back a failed collection', { timeout: 90000 }, async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'agromax-credit-checkout-'));
  fs.mkdirSync(path.join(temporary, 'db'));
  const processes = [], descriptors = [];
  const launch = (name, command, args, options = {}) => {
    const log = fs.openSync(path.join(temporary, `${name}.log`), 'a', 0o600); descriptors.push(log);
    const child = spawn(command, args, { ...options, stdio: ['ignore', log, log] }); processes.push(child); return child;
  };
  let connection;
  try {
    const mongoPort = await freePort(), appPort = await freePort();
    const uri = `mongodb://127.0.0.1:${mongoPort}/agromax_mvp_credit?directConnection=true`;
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
    const backend = path.resolve(__dirname, '..');
    const app = launch('backend', process.execPath, ['dist/main.js'], { cwd: backend, env: { ...process.env, AGROMAX_ENV_FILE: path.join(temporary, 'absent.env'), MONGODB_URI: uri, PORT: String(appPort), JWT_SECRET: randomBytes(32).toString('hex'), GREENTER_ENABLED: 'false', GREENTER_SIMULATION_ENABLED: 'false', GREENTER_ALLOW_PRODUCTION: 'false', DECOLECTA_API_KEY: '' } });
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
    const client = await request('POST', '/clients', { name: 'CLIENTE SINTETICO DE COBRO', documentNumber: '87654321' });
    assert.equal(client.branchId, id(8002));
    await request('POST', '/clients', { name: 'DUPLICADO', documentNumber: '87654321' }, 409);
    const payment = amount => [{ paymentMethodId: id(8006), amount }];
    const saleInput = { clientId: client.id, voucherType: 'NONE', isCredit: true, creditName: 'Campaña sintética', items: [{ productId: id(8010), companyId: id(8001), quantity: 1, priceTier: id(8005), unitPrice: 295 }] };
    const sale = await request('POST', '/sales', { ...saleInput, payments: payment(100) });
    assert.equal(sale.total, 295); assert.equal(sale.isCredit, true); assert.equal(sale.payments[0].amount, 100);
    let credits = await request('GET', `/credits/client/${client.id}/open`);
    assert.equal(credits.length, 1);
    const creditId = credits[0].id;
    assert.deepEqual([credits[0].totalAmount, credits[0].paidAmount, credits[0].pendingAmount, credits[0].status], [295, 100, 195, 'PARTIAL']);
    let credit = await request('GET', `/credits/${creditId}`);
    assert.equal(credit.payments.length, 1); assert.equal(credit.payments[0].paymentMethodId, id(8006));
    assert.ok(credit.payments[0].cashRegisterEntryId); assert.ok(credit.payments[0].notes.includes(sale.id));
    const cashEntries = async () => (await db.collection('cash_registers').find({}).toArray()).flatMap(register => register.entries).filter(entry => !entry.isDeleted);
    let entries = await cashEntries();
    assert.equal(entries.length, 1); assert.equal(entries[0].amount, 100); assert.equal(entries[0].category, 'CREDIT_PAYMENT');
    assert.equal(entries[0].referenceId.toString(), creditId); assert.equal(entries[0]._id.toString(), credit.payments[0].cashRegisterEntryId);
    credit = await request('POST', `/credits/${creditId}/payments`, { paymentMethodId: id(8006), amount: 50 });
    assert.deepEqual([credit.paidAmount, credit.pendingAmount, credit.payments.length], [150, 145, 2]);
    const secondSale = await request('POST', '/sales', { ...saleInput, creditAccountId: creditId, payments: payment(20), items: [{ ...saleInput.items[0], unitPrice: 80 }] });
    credit = await request('GET', `/credits/${creditId}`);
    assert.deepEqual([credit.totalAmount, credit.paidAmount, credit.pendingAmount], [375, 170, 205]);
    assert.deepEqual(new Set(credit.saleIds), new Set([sale.id, secondSale.id]));
    entries = await cashEntries(); assert.equal(entries.length, 3); assert.equal(entries.reduce((sum, entry) => sum + entry.amount, 0), 170);
    const snapshot = async () => {
      const data = {};
      for (const name of ['sales', 'stocks', 'stock_movements', 'cash_registers', 'credit_accounts']) data[name] = await db.collection(name).find({}).sort({ _id: 1 }).toArray();
      return data;
    };
    const beforeInvalid = await snapshot();
    for (const amount of [295, 296, 0, -1, 1.001]) await request('POST', '/sales', { ...saleInput, payments: payment(amount) }, 400);
    await request('POST', '/sales', { ...saleInput, payments: [{ paymentMethodId: id(9999), amount: 10 }] }, 400);
    await request('POST', '/sales', { ...saleInput, clientId: id(8020), creditAccountId: creditId, payments: payment(10) }, 400);
    assert.deepEqual(await snapshot(), beforeInvalid, 'Rejected collections must not alter stock, sale, debt or cash');
    const noDeposit = await request('POST', '/sales', { ...saleInput, payments: [] });
    credits = await request('GET', `/credits/client/${client.id}/open`);
    const unpaid = credits.find(account => account.saleIds.includes(noDeposit.id));
    assert.deepEqual([unpaid.paidAmount, unpaid.pendingAmount, unpaid.status], [0, 295, 'PENDING']);
    assert.equal((await cashEntries()).length, 3);
    // Fail after sale/stock/credit writes. The whole transaction must roll back.
    await db.collection('cash_registers').updateMany({}, { $set: { status: 'CLOSED' } });
    const beforeClosed = await snapshot();
    await request('POST', '/sales', { ...saleInput, creditAccountId: creditId, payments: payment(10) }, 400);
    assert.deepEqual(await snapshot(), beforeClosed, 'A closed cash register must roll back the complete credit sale and its deposit');
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
