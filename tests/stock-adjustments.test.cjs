const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { randomBytes, randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const { seed } = require('../scripts/seed-mvp.cjs');

const id = number => String(number).padStart(24, '0');
const oid = number => new mongoose.Types.ObjectId(id(number));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  return port;
}

test('stock adjustments use final quantities and atomic, branch-scoped, retry-safe batches', { timeout: 120000 }, async t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'agromax-stock-adjustments-'));
  fs.mkdirSync(path.join(temporary, 'db'));
  const processes = [], descriptors = [];
  const launch = (name, command, args, options = {}) => {
    const log = fs.openSync(path.join(temporary, `${name}.log`), 'a', 0o600); descriptors.push(log);
    const child = spawn(command, args, { ...options, stdio: ['ignore', log, log] }); processes.push(child); return child;
  };
  let connection;
  try {
    const mongoPort = await freePort(), appPort = await freePort();
    const uri = `mongodb://127.0.0.1:${mongoPort}/agromax_mvp_stockadjustments?directConnection=true`;
    launch('mongo', process.env.MONGOD_BIN || path.join(os.homedir(), '.cache/agromax-runtime/mongodb/bin/mongod'), ['--dbpath', path.join(temporary, 'db'), '--port', String(mongoPort), '--bind_ip', '127.0.0.1', '--replSet', 'stock-test']);
    for (let attempt = 0; attempt < 60; attempt++) {
      try { connection = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 200 }).asPromise(); break; } catch { await delay(100); }
    }
    assert.ok(connection, `Disposable MongoDB must start: ${temporary}`);
    const db = connection.db;
    await db.admin().command({ replSetInitiate: { _id: 'stock-test', members: [{ _id: 0, host: `127.0.0.1:${mongoPort}` }] } });
    for (let attempt = 0; attempt < 100; attempt++) {
      if ((await db.admin().command({ hello: 1 })).isWritablePrimary) break;
      await delay(100);
    }
    const password = randomBytes(16).toString('hex');
    await seed({ MVP_MODE: 'true', MONGODB_URI: uri, MVP_ADMIN_PASSWORD: password });
    const scope = { branch: oid(8002), company: oid(8001) };
    await db.collection('branches').updateOne({ _id: oid(8002) }, { $set: { name: 'Sausal' } });
    await db.collection('branches').insertMany([
      { _id: oid(8100), name: 'Ascope - Central', code: 'ASCOPE', companies: [oid(8001)], isActive: true },
      { _id: oid(8102), name: 'Paiján', code: 'PAIJAN', companies: [oid(8001)], isActive: true },
    ]);
    await db.collection('companies').insertOne({ _id: oid(8101), name: 'Otra empresa', ruc: '20600000009', isActive: true });
    await db.collection('stocks').insertOne({ ...scope, branch: oid(8100), product: oid(8010), quantity: 77 });
    await db.collection('products').insertOne({ _id: oid(8013), name: 'Producto con lotes', category: oid(8004), unit: 'UND', tracksLot: true, isActive: true, prices: [] });
    await db.collection('products').insertOne({ _id: oid(8014), name: 'Producto sin stock previo', category: oid(8004), unit: 'UND', tracksLot: false, isActive: true, prices: [] });
    await db.collection('stocks').insertOne({ ...scope, product: oid(8013), quantity: 99 });
    await db.collection('product_lots').insertMany([
      { _id: oid(8201), ...scope, product: oid(8013), lotNumber: 'EARLY', initialQuantity: 3, currentQuantity: 3, receivedAt: new Date('2026-01-01'), expirationDate: new Date('2026-12-01'), purchaseId: oid(8500), isActive: true },
      { _id: oid(8202), ...scope, product: oid(8013), lotNumber: 'LATE', initialQuantity: 5, currentQuantity: 5, receivedAt: new Date('2026-01-01'), expirationDate: new Date('2027-12-01'), purchaseId: oid(8500), isActive: true },
      { _id: oid(8203), ...scope, branch: oid(8100), product: oid(8013), lotNumber: 'OTHER', initialQuantity: 40, currentQuantity: 40, receivedAt: new Date(), isActive: true },
    ]);
    for (const collection of ['sales', 'purchases', 'cash_registers']) await db.collection(collection).insertOne({ _id: oid(8500), ...scope, marker: 'immutable history', total: 118, items: [{ product: oid(8010), quantity: 1 }] });
    const immutable = async () => Promise.all(['sales', 'purchases', 'cash_registers'].map(collection => db.collection(collection).find({}).toArray()));
    const before = await immutable();
    const backend = path.resolve(__dirname, '..');
    const app = launch('backend', process.execPath, ['dist/main.js'], { cwd: backend, env: { ...process.env, AGROMAX_ENV_FILE: path.join(temporary, 'absent.env'), AGROMAX_SKIP_BOOTSTRAP: 'true', MONGODB_URI: uri, PORT: String(appPort), JWT_SECRET: randomBytes(32).toString('hex'), GREENTER_ENABLED: 'false', GREENTER_SIMULATION_ENABLED: 'false', GREENTER_ALLOW_PRODUCTION: 'false', DECOLECTA_API_KEY: '' } });
    for (let attempt = 0; attempt < 150; attempt++) {
      if (app.exitCode !== null) throw new Error(`Test backend exited. Log: ${path.join(temporary, 'backend.log')}`);
      try { if ((await fetch(`http://127.0.0.1:${appPort}/api/health`)).ok) break; } catch {}
      await delay(100);
    }
    let authorization;
    const raw = async (method, route, body, branch = id(8002)) => {
      const response = await fetch(`http://127.0.0.1:${appPort}/api${route}`, { method, headers: { 'Content-Type': 'application/json', ...(branch ? { 'x-branch-id': branch } : {}), ...(authorization ? { Authorization: authorization } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, body: await response.json() };
    };
    const request = async (method, route, body, expected = method === 'POST' ? 201 : 200, branch) => {
      const response = await raw(method, route, body, branch);
      assert.equal(response.status, expected, `${route}: ${JSON.stringify(response.body)}`); return response.body.data;
    };
    const set = (product, quantity, expectedQuantity) => ({ productId: id(product), type: 'SET', quantity, expectedQuantity });
    const payload = (items, overrides = {}) => ({ companyId: id(8001), requestId: randomUUID(), reason: 'Conteo físico', items, ...overrides });
    const batch = (items, expected = 201, overrides) => request('POST', '/stock-adjustments/batch', payload(items, overrides), expected);
    const stock = async (product, branch = 8002) => (await db.collection('stocks').findOne({ product: oid(product), company: oid(8001), branch: oid(branch) }))?.quantity;
    const auditCounts = async () => Promise.all(['stock_adjustments', 'stock_movements', 'stock_adjustment_batches'].map(collection => db.collection(collection).countDocuments()));

    await t.test('authentication and existing seller restrictions apply to the new endpoint', async () => {
      await request('POST', '/stock-adjustments/batch', payload([set(8010, 20, 100)]), 401);
      authorization = `Bearer ${(await request('POST', '/auth/login', { username: 'mvpadmin', password })).accessToken}`;
      const admin = authorization;
      await request('POST', '/users', { username: 'stock-seller', password: 'synthetic-seller-password', fullName: 'Vendedor', role: 'VENDEDOR', branchAssignments: [{ branchId: id(8002), role: 'VENDEDOR' }] });
      authorization = `Bearer ${(await request('POST', '/auth/login', { username: 'stock-seller', password: 'synthetic-seller-password' })).accessToken}`;
      await batch([set(8010, 20, 100)], 403);
      authorization = admin;
      await request('POST', '/stock-adjustments/batch', payload([set(8010, 20, 100)]), 400, '');
      await batch([set(8010, 20, 100)], 403, { companyId: id(8101) });
      assert.equal(await stock(8010), 100);
    });
    await t.test('consultation lists all three branches before product selection and keeps zero-stock branches', async () => {
      const beforeStocks = await db.collection('stocks').find({}).toArray();
      const beforeAudit = await auditCounts();
      const branches = await request('GET', `/stock/branches?companyId=${id(8001)}`);
      assert.deepEqual(branches.map(branch => branch.branchName).sort(), ['Ascope - Central', 'Paiján', 'Sausal']);
      assert.deepEqual(branches.filter(branch => branch.isCurrent).map(branch => branch.branchName), ['Sausal']);
      const availability = await request('GET', `/stock/availability/${id(8010)}?companyId=${id(8001)}`);
      assert.equal(availability.branches.length, 3);
      assert.deepEqual(Object.fromEntries(availability.branches.map(branch => [branch.branchName, branch.quantity])), { 'Ascope - Central': 77, 'Paiján': 0, 'Sausal': 100 });
      const other = await request('GET', `/stock/availability/${id(8010)}?companyId=${id(8001)}`, undefined, 200, id(8102));
      assert.deepEqual(other.branches.filter(branch => branch.isCurrent).map(branch => branch.branchName), ['Paiján']);
      assert.equal(other.branches.find(branch => branch.branchName === 'Sausal').quantity, 100);
      await request('GET', '/stock/branches', undefined, 400);
      await request('GET', '/stock/branches?companyId=invalid', undefined, 400);
      await request('GET', `/stock/branches?companyId=${id(8101)}`, undefined, 400);
      await request('GET', `/stock/branches?companyId=${id(8001)}`, undefined, 400, '');
      assert.deepEqual(await db.collection('stocks').find({}).toArray(), beforeStocks);
      assert.deepEqual(await auditCounts(), beforeAudit);
    });
    await t.test('establishing 20 records the real decrease instead of adding 20', async () => {
      const result = await batch([set(8010, 20, 100)]);
      assert.equal(await stock(8010), 20);
      assert.equal(result.adjustments.length, 1);
      assert.deepEqual([result.adjustments[0].mode, result.adjustments[0].type, result.adjustments[0].quantity, result.adjustments[0].previousQuantity, result.adjustments[0].newQuantity], ['SET', 'DECREASE', 80, 100, 20]);
      const movement = await db.collection('stock_movements').findOne({ referenceId: new mongoose.Types.ObjectId(result.adjustments[0].id) });
      assert.equal(movement.movementType, 'ADJUSTMENT_OUT'); assert.equal(movement.quantity, 80); assert.equal(movement.user.toString(), id(8003));
    });
    await t.test('a single batch mixes final counts, increases and decreases', async () => {
      const result = await batch([set(8010, 25, 20), { productId: id(8011), type: 'INCREASE', quantity: 3, expectedQuantity: 100 }, { productId: id(8012), type: 'DECREASE', quantity: 4, expectedQuantity: 100 }]);
      assert.equal(result.adjustments.length, 3);
      assert.deepEqual(await Promise.all([8010, 8011, 8012].map(product => stock(product))), [25, 103, 96]);
      assert.equal(new Set(result.adjustments.map(item => item.requestId)).size, 1);
    });
    await t.test('zero final counts, fractional quantities and unchanged rows are handled correctly', async () => {
      const result = await batch([set(8010, 0, 25), set(8011, 103, 103)]);
      assert.equal(await stock(8010), 0); assert.equal(result.adjustments.length, 1); assert.deepEqual(result.unchangedProductIds, [id(8011)]);
      await batch([set(8010, 0.125001, 0)]); assert.equal(await stock(8010), 0.125001);
      const counts = await auditCounts();
      const noChange = await batch([set(8010, 0.125001, 0.125001)]);
      assert.equal(noChange.adjustments.length, 0);
      const next = await auditCounts(); assert.equal(next[0], counts[0]); assert.equal(next[1], counts[1]);
      await batch([set(8014, 20, 0)]); assert.equal(await stock(8014), 20);
    });
    await t.test('invalid or duplicate rows are rejected without changing inventory', async () => {
      const counts = await auditCounts();
      for (const items of [[set(8010, 20, 0.125001), set(8010, 30, 0.125001)], [set(8010, -1, 0.125001)], [{ productId: id(8010), type: 'SET', quantity: 20 }], [{ productId: id(8010), type: 'INCREASE', quantity: 0 }], [set(8010, 0.1234567, 0.125001)], []]) await batch(items, 400);
      await batch([set(8010, 20, 0.125001)], 400, { reason: '   ' });
      assert.deepEqual(await auditCounts(), counts); assert.equal(await stock(8010), 0.125001);
    });
    await t.test('a later sale or purchase causes a conflict and rolls back the entire batch', async () => {
      await db.collection('stocks').updateOne({ ...scope, product: oid(8012) }, { $inc: { quantity: -1 } });
      const counts = await auditCounts();
      await batch([set(8010, 20, 0.125001), set(8012, 15, 96)], 409);
      assert.equal(await stock(8010), 0.125001); assert.equal(await stock(8012), 95); assert.deepEqual(await auditCounts(), counts);
    });
    await t.test('errors after an earlier row roll back stock and audit writes', async () => {
      const counts = await auditCounts();
      await batch([set(8010, 20, 0.125001), { productId: id(8012), type: 'DECREASE', quantity: 500 }], 400);
      await batch([set(8010, 20, 0.125001), set(9999, 20, 0)], 400);
      assert.equal(await stock(8010), 0.125001); assert.deepEqual(await auditCounts(), counts);
    });
    await t.test('lot-based counts use the displayed lot sum and reductions consume FEFO', async () => {
      const result = await batch([set(8013, 5, 8)]);
      assert.equal(result.adjustments[0].previousQuantity, 8); assert.equal(result.adjustments[0].quantity, 3); assert.equal(await stock(8013), 5);
      const lots = await db.collection('product_lots').find({ ...scope, product: oid(8013) }).sort({ lotNumber: 1 }).toArray();
      assert.deepEqual(lots.map(lot => [lot.lotNumber, lot.currentQuantity, lot.initialQuantity, lot.isActive]), [['EARLY', 0, 3, false], ['LATE', 5, 5, true]]);
      assert.ok(lots.every(lot => lot.purchaseId.toString() === id(8500)));
    });
    await t.test('increases keep the lot sum synchronized and rollback an inconsistent lot expiration', async () => {
      await batch([set(8013, 20, 5)]);
      const lots = await db.collection('product_lots').find({ ...scope, product: oid(8013), isActive: true }).toArray();
      assert.equal(lots.reduce((sum, lot) => sum + lot.currentQuantity, 0), 20); assert.equal(await stock(8013), 20);
      assert.equal(lots.find(lot => /^ADJ-/.test(lot.lotNumber)).currentQuantity, 15);
      const counts = await auditCounts();
      await batch([set(8010, 20, 0.125001), { ...set(8013, 22, 20), lotNumber: 'LATE', expirationDate: '2028-01-01' }], 400);
      assert.equal(await stock(8010), 0.125001); assert.equal(await stock(8013), 20); assert.deepEqual(await auditCounts(), counts);
      await batch([{ ...set(8013, 22, 20), lotNumber: 'LATE', expirationDate: '2027-12-01' }]);
      assert.equal((await db.collection('product_lots').findOne({ _id: oid(8202) })).currentQuantity, 7);
      await batch([set(8013, 0, 22)]); assert.equal(await stock(8013), 0);
      assert.equal(await db.collection('product_lots').countDocuments({ ...scope, product: oid(8013), currentQuantity: { $gt: 0 } }), 0);
    });
    await t.test('concurrent retries share one commit and mismatched replays are rejected', async () => {
      const body = payload([{ productId: id(8011), type: 'INCREASE', quantity: 2, expectedQuantity: 103 }]);
      const beforeCounts = await auditCounts();
      const results = await Promise.all(Array.from({ length: 4 }, () => raw('POST', '/stock-adjustments/batch', body)));
      results.forEach(response => assert.equal(response.status, 201, JSON.stringify(response.body)));
      assert.equal(new Set(results.map(response => response.body.data.adjustments[0].id)).size, 1);
      assert.equal(await stock(8011), 105);
      const afterCounts = await auditCounts(); assert.deepEqual(afterCounts.map((count, index) => count - beforeCounts[index]), [1, 1, 1]);
      const replay = await request('POST', '/stock-adjustments/batch', body); assert.equal(replay.adjustments[0].id, results[0].body.data.adjustments[0].id);
      await request('POST', '/stock-adjustments/batch', { ...body, reason: 'Contenido cambiado' }, 409);
    });
    await t.test('distinct simultaneous final counts cannot overwrite each other', async () => {
      const results = await Promise.all([20, 30].map(quantity => raw('POST', '/stock-adjustments/batch', payload([set(8011, quantity, 105)]))));
      assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
      assert.ok([20, 30].includes(await stock(8011)));
    });
    await t.test('waste, exits, entries and counts keep distinct audit semantics', async () => {
      const waste = await batch([{ productId: id(8014), type: 'DECREASE', movementKind: 'WASTE', quantity: 3, expectedQuantity: 20 }]);
      assert.equal(await stock(8014), 17); assert.equal(waste.adjustments[0].movementKind, 'WASTE');
      const movement = await db.collection('stock_movements').findOne({ referenceId: new mongoose.Types.ObjectId(waste.adjustments[0].id) });
      assert.equal(movement.movementType, 'ADJUSTMENT_OUT'); assert.match(movement.description, /^Merma:/);
      await batch([{ productId: id(8014), type: 'DECREASE', movementKind: 'EXIT', quantity: 1, expectedQuantity: 17 }]);
      await batch([{ productId: id(8014), type: 'INCREASE', movementKind: 'ENTRY', quantity: 2, expectedQuantity: 16 }]);
      const count = await batch([{ ...set(8014, 20, 18), movementKind: 'COUNT' }]);
      assert.equal(count.adjustments[0].movementKind, 'COUNT');
      const counts = await auditCounts();
      for (const [type, movementKind] of [['INCREASE', 'WASTE'], ['SET', 'ENTRY'], ['DECREASE', 'COUNT']]) await batch([{ productId: id(8014), type, movementKind, quantity: 1, expectedQuantity: 20 }], 400);
      assert.deepEqual(await auditCounts(), counts); assert.equal(await stock(8014), 20);
    });
    await t.test('a whole-catalog count saves more than 100 products and accepts matching counts without false movements', async () => {
      const numbers = Array.from({ length: 101 }, (_, index) => 8600 + index);
      await db.collection('products').insertMany(numbers.map(number => ({ _id: oid(number), name: `Conteo ${number}`, category: oid(8004), unit: 'UND', tracksLot: false, isActive: true, prices: [] })));
      const result = await batch(numbers.map(number => ({ ...set(number, 1, 0), movementKind: 'COUNT' })));
      assert.equal(result.adjustments.length, 101);
      assert.equal(await db.collection('stocks').countDocuments({ ...scope, product: { $in: numbers.map(oid) }, quantity: 1 }), 101);
      const before = await auditCounts();
      const matching = await batch(numbers.map(number => ({ ...set(number, 1, 1), movementKind: 'COUNT' })));
      assert.equal(matching.adjustments.length, 0); assert.equal(matching.unchangedProductIds.length, 101);
      const after = await auditCounts(); assert.equal(after[0], before[0]); assert.equal(after[1], before[1]);
      await batch(Array.from({ length: 1001 }, (_, index) => set(10000 + index, 1, 0)), 400);
    });
    await t.test('legacy single adjustments remain supported and all unrelated history is preserved', async () => {
      const result = await request('POST', '/stock-adjustments', { productId: id(8012), companyId: id(8001), type: 'INCREASE', quantity: 2, reason: 'Ajuste individual' });
      assert.equal(result.previousQuantity, 95); assert.equal(result.newQuantity, 97); assert.equal(await stock(8012), 97);
      assert.equal(await stock(8010, 8100), 77);
      assert.equal((await db.collection('product_lots').findOne({ _id: oid(8203) })).currentQuantity, 40);
      assert.deepEqual(await immutable(), before);
      const history = await request('GET', '/stock-adjustments?limit=100'); assert.ok(history.data.some(adjustment => adjustment.mode === 'SET'));
    });
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
