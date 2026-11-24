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

test('cash movements distinguish physical money, preserve their sources and close with a durable audited count', { timeout: 90000 }, async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'agromax-cash-register-'));
  fs.mkdirSync(path.join(temporary, 'db'));
  const processes = [], descriptors = [];
  const launch = (name, command, args, options = {}) => {
    const log = fs.openSync(path.join(temporary, `${name}.log`), 'a', 0o600); descriptors.push(log);
    const child = spawn(command, args, { ...options, stdio: ['ignore', log, log] }); processes.push(child); return child;
  };
  let connection;
  try {
    const mongoPort = await freePort(), appPort = await freePort();
    const uri = `mongodb://127.0.0.1:${mongoPort}/agromax_mvp_cash?directConnection=true`;
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
    const yape = await request('POST', '/payment-methods', { name: 'Yape' });
    const bank = await request('POST', '/payment-methods', { name: 'Transferencia' });
    let register = await request('POST', '/cash-registers/open', { openingBalance: 100 });
    const registerId = register.id;
    const entry = async (type, category, amount, method = id(8006)) => request('POST', `/cash-registers/${registerId}/entries`, { type, category, amount, paymentMethodId: method, description: 'Movimiento sintético' });
    await entry('INCOME', 'OTHER', 25.10);
    await entry('EXPENSE', 'OPERATING_EXPENSE', 10.05);
    await entry('EXPENSE', 'WITHDRAWAL', 20);
    await entry('INCOME', 'CAPITAL_CONTRIBUTION', 30, bank.id);
    const client = await request('POST', '/clients', { name: 'CLIENTE SINTÉTICO CAJA', documentNumber: '87654321' });
    const saleInput = { clientId: client.id, voucherType: 'NONE', items: [{ productId: id(8010), companyId: id(8001), quantity: 1, priceTier: id(8005), unitPrice: 118 }] };
    const sale = await request('POST', '/sales', { ...saleInput, payments: [{ paymentMethodId: id(8006), amount: 68 }, { paymentMethodId: yape.id, amount: 50 }] });
    await request('POST', '/sales', { ...saleInput, isCredit: true, payments: [], items: [{ ...saleInput.items[0], unitPrice: 50 }] });
    const [credit] = await request('GET', `/credits/client/${client.id}/open`);
    await request('POST', `/credits/${credit.id}/payments`, { paymentMethodId: yape.id, amount: 10 });
    register = await request('GET', '/cash-registers/today');
    const { summarizeCash } = require('../dist/shared/utils/cash-summary');
    let summary = summarizeCash(register.openingBalance, register.entries);
    assert.deepEqual([summary.income, summary.expense, summary.balance, summary.expectedCash], [183.1, 30.05, 253.05, 163.05]);
    assert.deepEqual(summary.sources, { sales: 118, creditPayments: 10, otherIncome: 55.1 });
    assert.equal(register.entries.filter(e => e.referenceId === sale.id).length, 2);
    assert.ok(register.entries.every(e => e.paymentMethodId && e.paymentMethodName));
    assert.equal(register.entries.find(e => e.category === 'CREDIT_PAYMENT').paymentMethodName, 'Yape');
    const manual = register.entries.find(e => e.category === 'OPERATING_EXPENSE');
    const editPath = `/cash-registers/${registerId}/entries/${manual.id}`;
    register = await request('PATCH', editPath, { amount: manual.amount, reason: 'Pagado mediante transferencia', paymentMethodId: bank.id });
    assert.equal(register.entries.find(e => e.id === manual.id).editHistory.at(-1).newPaymentMethodName, 'Transferencia');
    summary = summarizeCash(register.openingBalance, register.entries);
    assert.equal(summary.expectedCash, 173.10);
    const saleEntry = register.entries.find(e => e.referenceId === sale.id && e.paymentMethodName === 'Efectivo');
    await request('PATCH', `/cash-registers/${registerId}/entries/${saleEntry.id}`, { amount: 67, reason: 'Intento de alterar venta' }, 400);
    await request('PATCH', `/cash-registers/${registerId}/entries/${saleEntry.id}`, { amount: 68, reason: 'Intento de alterar medio', paymentMethodId: yape.id }, 400);
    for (const linked of register.entries.filter(e => e.referenceId)) {
      const before = await request('GET', '/cash-registers/today');
      for (const change of [{ voucherType: 'BOLETA' }, { voucherType: 'FACTURA' }, { voucherSeries: 'B999' }, { voucherNumber: '99999999' }]) {
        await request('PATCH', `/cash-registers/${registerId}/entries/${linked.id}`, { amount: linked.amount, reason: 'Intento de alterar comprobante de origen', ...change }, 400);
      }
      assert.deepEqual(await request('GET', '/cash-registers/today'), before, 'A rejected voucher edit must leave cash and audit history unchanged');
      await request('DELETE', `/cash-registers/${registerId}/entries/${linked.id}`, { reason: 'Intento de separar cobro' }, 400);
    }
    assert.equal((await request('GET', '/cash-registers/today')).entries.filter(e => e.isDeleted).length, 0);
    // Manual categories cannot pretend to be linked sales, payments or invalid withdrawals.
    await request('POST', `/cash-registers/${registerId}/entries`, { type: 'INCOME', category: 'WITHDRAWAL', amount: 10, paymentMethodId: id(8006), description: 'Retiro inválido' }, 400);
    for (const body of [
      { type: 'INCOME', category: 'SALE', amount: 10, paymentMethodId: id(8006), description: 'Venta falsa' },
      { type: 'EXPENSE', category: 'OTHER', amount: 1.001, paymentMethodId: id(8006), description: 'Decimales' },
      { type: 'EXPENSE', category: 'OTHER', amount: 1, description: 'Sin método' },
      { type: 'EXPENSE', category: 'OTHER', amount: 1, paymentMethodId: id(8006), description: '   ' },
    ]) await request('POST', `/cash-registers/${registerId}/entries`, body, 400);
    const close = body => request('POST', `/cash-registers/${registerId}/close`, body);
    // A legacy movement is visible as unclassified; never silently assume cash.
    const legacyId = new mongoose.Types.ObjectId();
    await db.collection('cash_registers').updateOne({ _id: new mongoose.Types.ObjectId(registerId) }, { $push: { entries: { _id: legacyId, type: 'INCOME', category: 'OTHER', amount: 5, description: 'Registro antiguo sin método', isDeleted: false, editHistory: [] } }, $inc: { __v: 1 } });
    register = await request('GET', '/cash-registers/today');
    await request('POST', `/cash-registers/${registerId}/close`, { countedCash: 173.10, expectedRevision: register.revision }, 400);
    register = await request('PATCH', `/cash-registers/${registerId}/entries/${legacyId}`, { amount: 5, paymentMethodId: yape.id, reason: 'Identificado en el archivo' });
    // Soft-deleted movements do not enter the count.
    register = await request('DELETE', `/cash-registers/${registerId}/entries/${legacyId}`, { reason: 'Registro sintético duplicado' });
    assert.equal(summarizeCash(register.openingBalance, register.entries).expectedCash, 173.10);
    const staleVersion = register.revision;
    register = await entry('EXPENSE', 'WITHDRAWAL', 3.10);
    assert.equal(summarizeCash(register.openingBalance, register.entries).expectedCash, 170);
    await request('POST', `/cash-registers/${registerId}/close`, { countedCash: 173.10, expectedRevision: staleVersion }, 409);
    await request('POST', `/cash-registers/${registerId}/close`, { countedCash: 169, expectedRevision: register.revision }, 400);
    for (const countedCash of [-1, 1.001]) await request('POST', `/cash-registers/${registerId}/close`, { countedCash, expectedRevision: register.revision, notes: 'Valor inválido' }, 400);
    const otherBranch = await request('POST', '/branches', { name: 'Sucursal sintética secundaria', code: 'TEST-SECONDARY', companyIds: [id(8001)] });
    await request('POST', `/cash-registers/${registerId}/close`, { countedCash: 169, expectedRevision: register.revision, notes: 'Ajeno' }, 400, otherBranch.id);
    const { MongoCashRegisterRepository } = require('../dist/infrastructure/database/mongodb/repositories/mongo-cash-register.repository');
    const { CashRegisterDocument, CashRegisterSchema } = require('../dist/infrastructure/database/mongodb/schemas/cash-register.schema');
    const model = connection.model(CashRegisterDocument.name, CashRegisterSchema);
    const repository = new MongoCashRegisterRepository(model);
    const beforeRace = await repository.findById(registerId);
    await repository.addEntry(registerId, { type: 'INCOME', category: 'OTHER', description: 'Carrera sintética [Efectivo]', amount: 1 });
    assert.equal(await repository.closeIfUnchanged(registerId, beforeRace.revision, { status: 'CLOSED' }), null);
    register = await request('GET', '/cash-registers/today');
    register = await close({ countedCash: 170, expectedRevision: register.revision, notes: 'Falta un sol en el conteo sintético' });
    assert.equal(register.status, 'CLOSED');
    assert.deepEqual([register.cashCount.expectedAmount, register.cashCount.countedAmount, register.cashCount.difference], [171, 170, -1]);
    assert.ok(register.closedBy); assert.ok(register.closedAt);
    assert.equal(register.cashCount.methods.find(m => m.name === 'Yape').net, 60);
    assert.equal(register.cashCount.methods.find(m => m.name === 'Transferencia').net, 19.95);
    assert.equal(register.closingBalance, 250.95);
    const stored = await db.collection('cash_registers').findOne({ _id: new mongoose.Types.ObjectId(registerId) });
    await request('POST', `/cash-registers/${registerId}/entries`, { type: 'INCOME', category: 'OTHER', amount: 1, paymentMethodId: id(8006), description: 'Ya cerrada' }, 400);
    await request('PATCH', editPath, { amount: 1, reason: 'Cambio posterior al cierre' }, 400);
    await request('POST', `/cash-registers/${registerId}/close`, { countedCash: 170, expectedRevision: register.revision }, 400);
    await assert.rejects(repository.addEntry(registerId, { type: 'INCOME', category: 'OTHER', amount: 1, description: 'Cobro tardío' }), /cerrada/);
    await assert.rejects(repository.updateOpenEntry(registerId, manual.id, { amount: 2 }), /cerrada/);
    assert.deepEqual(await db.collection('cash_registers').findOne({ _id: stored._id }), stored);
    // Real local HTTP checkout records the consumed lot and cancellation is idempotent.
    const seedProduct = await db.collection('products').findOne({ _id: new mongoose.Types.ObjectId(id(8010)) });
    const lotProduct = await request('POST', '/products', { name: 'Producto por lotes para anulación', categoryId: String(seedProduct.category), unit: 'UND', tracksLot: true, taxType: 'GRAVADO', prices: [{ priceTierId: id(8005), companyId: id(8001), branchId: otherBranch.id, price: 118 }] });
    const lotId = new mongoose.Types.ObjectId();
    const lotScope = { product: new mongoose.Types.ObjectId(lotProduct.id), company: new mongoose.Types.ObjectId(id(8001)), branch: new mongoose.Types.ObjectId(otherBranch.id) };
    await db.collection('stocks').insertOne({ ...lotScope, quantity: 7 });
    await db.collection('product_lots').insertOne({ _id: lotId, ...lotScope, lotNumber: 'LOTE-ORIGEN', initialQuantity: 7, currentQuantity: 7, isActive: true });
    const lotSale = await request('POST', '/sales', { voucherType: 'NONE', items: [{ productId: lotProduct.id, companyId: id(8001), quantity: 2, priceTier: id(8005), unitPrice: 118, lotId: String(lotId) }], payments: [{ paymentMethodId: id(8006), amount: 236 }] }, 201, otherBranch.id);
    assert.deepEqual(lotSale.items[0].lotAllocations, [{ lotId: String(lotId), quantity: 2 }]);
    assert.equal((await db.collection('product_lots').findOne({ _id: lotId })).currentQuantity, 5);
    for (let retry = 0; retry < 2; retry++) {
      const cancelled = await request('DELETE', `/sales/${lotSale.id}`, { reason: 'Venta de prueba no realizada' }, 200, otherBranch.id);
      assert.equal(cancelled.isCancelled, true);
    }
    assert.equal((await db.collection('stocks').findOne(lotScope)).quantity, 7);
    assert.equal((await db.collection('product_lots').findOne({ _id: lotId })).currentQuantity, 7);
    assert.equal(await db.collection('stock_movements').countDocuments({ referenceId: new mongoose.Types.ObjectId(lotSale.id), referenceType: 'SaleCancellation' }), 1);
    assert.equal(await db.collection('billing_documents').countDocuments(), 0, 'Tests must not emit fiscal documents');
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
