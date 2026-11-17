const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const mongoose = require('mongoose');
const { EJSON } = require('bson');
const XLSX = require('xlsx');
const { preparePlan, importPlan, displayName, BRANCH, COMPANY, RUC } = require('../scripts/import-sausal-export.cjs');
// Synthetic records only: never publish or load the customer's workbook.
const records = Array.from({ length: 627 }, (_, index) => ({
  SKU: index === 0 ? '000001' : index === 10 || index === 501 ? 'TEST-DUP' : `TEST-${String(index).padStart(5, '0')}`,
  'Categoría': 'Categoria de prueba', 'Sub-Categoría': 'Subcategoria de prueba',
  IVA: index < 98 || index >= 620 && index < 623 ? 'exonerado' : 'gravado',
  Linea: 'HERBICIDA AGRICOLA', Marca: '',
  'Nombre del Producto': index === 10 ? 'ARTICULO DE PRUEBA' : index === 501 ? 'ARTICULO DE PRUEBA BONIFICACION' : `ARTICULO SINTETICO ${index}`,
  'Descripción': '', 'Control Stock': 'PRESENTACION',
  'Presentación': index === 31 ? 'SOBRE X 100G' : 'UNIDAD', Equivalencia: 1,
  'Precio Vta.': index < 7 ? 0 : 100,
  'Estado Ofe.': index >= 7 && index < 321 || index === 597 ? 'ACTIVO' : 'INACTIVO',
  'Precio Ofe.': index >= 7 && index < 321 || index === 597 ? 95 : 0,
  'Und. Medida': 'UNIDAD', 'Und. Fiscal': 'NIU',
  Stock: index < 5 ? [1.5, 2.75, 3.25, 4.2, 5.7][index] : index < 500 || index >= 620 && index < 623 ? 12 : index < 597 || index >= 623 ? 0 : -1,
  'Stock General': index === 500 ? 1 : index < 5 ? [1.5, 2.75, 3.25, 4.2, 5.7][index] : index < 500 || index >= 620 && index < 623 ? 12 : index < 597 || index >= 623 ? 0 : -1,
  'Estado Publicado': 'ESPERA', 'Estado Producto': index < 620 ? 'ACTIVO' : 'BAJA',
}));
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(records), 'Productos');
const plan = preparePlan(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));

test('catalog parsing keeps source status, taxes and base sale prices', () => {
  assert.equal(plan.counts.sourceRows, 627);
  assert.equal(plan.counts.active, 620);
  assert.equal(plan.counts.inactive, 7);
  assert.equal(plan.counts.gravado, 522);
  assert.equal(plan.counts.exonerado, 98);
  assert.equal(plan.counts.noPrice, 7);
  assert.equal(plan.counts.negativeStock, 23);
  const sale = plan.rows.find(row => row.sku === 'TEST-00597');
  assert.equal(sale.price, 100); assert.equal(sale.offerPrice, 95);
  assert.equal(sale.stock, -1); assert.equal(sale.stockStatus, 'PENDING_NEGATIVE');
});

test('repeated SKUs, zero-prefixed SKUs and package units preserve distinct source identities', () => {
  const repeated = plan.rows.filter(row => row.sku === 'TEST-DUP');
  assert.equal(repeated.length, 2);
  assert.notEqual(repeated[0].id, repeated[1].id);
  assert.equal(repeated[0].stock, 12); assert.equal(repeated[1].stock, 0);
  assert.ok(plan.rows.some(row => row.sku === '000001'));
  assert.equal(plan.rows.find(row => row.sku === '000001').catalogStatus, 'PENDING_REVIEW');
  const sachet = plan.rows.find(row => row.excelRow === 33);
  assert.equal(sachet.presentation, 'SOBRE X 100G'); assert.equal(sachet.stock, 12);
  assert.ok(!sachet.name.includes('NIU'));
});

test('fractional quantities and local stock remain exact, without rounding or adding general stock', () => {
  assert.equal(plan.rows.find(row => row.excelRow === 2).stock, 1.5);
  assert.equal(plan.rows.find(row => row.excelRow === 3).stock, 2.75);
  const discrepancy = plan.rows.find(row => row.sku === 'TEST-00500');
  assert.equal(discrepancy.stock, 0); assert.equal(discrepancy.generalStock, 1);
  assert.ok(discrepancy.warnings.length);
  assert.equal(displayName('VITAFOL PLUS(10-55-10)1KG (VITAFOL PLUS(10-55-10)1KG)'), 'VITAFOL PLUS(10-55-10)1KG');
});

test('transactional import preserves history and other branches; repeating it never resets stock after a sale', { timeout: 60000 }, async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'agromax-sausal-export-'));
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const mongo = spawn(process.env.MONGOD_BIN || path.join(os.homedir(), '.cache/agromax-runtime/mongodb/bin/mongod'), ['--dbpath', temporary, '--bind_ip', '127.0.0.1', '--port', String(port), '--replSet', 'sausal-test'], { stdio: 'ignore' });
  let client;
  try {
    client = new mongoose.mongo.MongoClient(`mongodb://127.0.0.1:${port}/?directConnection=true`, { serverSelectionTimeoutMS: 500 });
    let connected = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      try { await client.connect(); connected = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert.ok(connected, 'Temporary MongoDB did not start');
    await client.db('admin').command({ replSetInitiate: { _id: 'sausal-test', members: [{ _id: 0, host: `127.0.0.1:${port}` }] } });
    let primary = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if ((await client.db('admin').command({ hello: 1 })).isWritablePrimary) { primary = true; break; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(primary);
    const db = client.db(`agromax_test_sausal_${Date.now()}`);
    const branch = new mongoose.Types.ObjectId(BRANCH), company = new mongoose.Types.ObjectId(COMPANY);
    const oldId = new mongoose.Types.ObjectId(), otherBranch = new mongoose.Types.ObjectId();
    await db.collection('branches').insertOne({ _id: branch, code: 'SAUSAL', isActive: true, companies: [company] });
    await db.collection('companies').insertOne({ _id: company, ruc: RUC });
    await db.collection('price-tiers').insertOne({ _id: new mongoose.Types.ObjectId(), name: 'Minorista', isActive: true });
    await db.collection('users').insertOne({ _id: new mongoose.Types.ObjectId(), username: 'admin', role: 'ADMIN', isActive: true });
    await db.collection('products').insertOne({ _id: oldId, name: 'Previous provisional record', isActive: true, unit: 'PENDIENTE', catalogStatus: 'PENDING_REVIEW', prices: [], updatedAt: new Date(), catalogImport: { sourceFile: 'Inventario_Transcrito_Agromax_Sausal.xlsx', branchId: BRANCH } });
    await db.collection('stocks').insertOne({ _id: new mongoose.Types.ObjectId(), branch: otherBranch, product: new mongoose.Types.ObjectId(), company, quantity: 9 });
    await db.collection('sales').insertOne({ _id: new mongoose.Types.ObjectId(), total: 1, label: 'Preserved historical sale' });
    await db.collection('billing_documents').insertOne({ _id: new mongoose.Types.ObjectId(), status: 'ACCEPTED', number: 2 });
    await db.collection('billing_counters').insertOne({ _id: 'production:BAG1', next: 3 });
    const before = EJSON.stringify(await db.collection('stocks').find({ branch: otherBranch }).toArray());
    await assert.rejects(importPlan(db, plan, { apply: true, testDatabase: true }), /confirmar/);
    assert.equal(await db.collection('products').countDocuments(), 1);
    const result = await importPlan(db, plan, { apply: true, stockConfirmed: true, testDatabase: true });
    assert.equal(result.productsCreated, 627); assert.equal(result.archivedDrafts, 1);
    assert.equal(result.stocksCreated, 604); assert.equal(result.kardexEntries, 503);
    assert.ok(Object.values(result.preserved).every(Boolean));
    assert.equal((await db.collection('products').findOne({ _id: oldId })).isActive, false);
    assert.equal(await db.collection('products').countDocuments({ isActive: true }), 620);
    assert.equal(await db.collection('products').countDocuments({ isActive: true, catalogStatus: 'PENDING_REVIEW' }), 7);
    const negative = plan.rows.find(row => row.stockStatus === 'PENDING_NEGATIVE');
    assert.equal(await db.collection('stocks').findOne({ product: new mongoose.Types.ObjectId(negative.id) }), null);
    const inactive = plan.rows.find(row => !row.active && row.stock > 0);
    assert.equal((await db.collection('products').findOne({ _id: new mongoose.Types.ObjectId(inactive.id) })).isActive, false);
    assert.equal((await db.collection('stocks').findOne({ product: new mongoose.Types.ObjectId(inactive.id), branch })).quantity, inactive.stock);
    // Exercise the repository's actual sort/skip/limit against MongoDB with a
    // whole batch sharing timestamps. Population is irrelevant to identity.
    function nativeModel(collection) {
      return {
        find(query) {
          let cursor = collection.find(query);
          return {
            collation(value) { cursor = cursor.collation(value); return this; },
            populate() { return this; },
            skip(value) { cursor = cursor.skip(value); return this; },
            limit(value) { cursor = cursor.limit(value); return this; },
            sort(value) { cursor = cursor.sort(value); return this; },
            lean() { return this; },
            exec() { return cursor.toArray(); },
          };
        },
        countDocuments(query) {
          let collation;
          return {
            collation(value) { collation = value; return this; },
            exec: () => collection.countDocuments(query, collation ? { collation } : undefined),
          };
        },
      };
    }
    const { MongoProductRepository } = require('../dist/infrastructure/database/mongodb/repositories/mongo-product.repository');
    const { MongoStockMovementRepository } = require('../dist/infrastructure/database/mongodb/repositories/mongo-stock-movement.repository');
    for (const [repository, count] of [
      [new MongoProductRepository(nativeModel(db.collection('products'))), 620],
      [new MongoStockMovementRepository(nativeModel(db.collection('stock_movements'))), 503],
    ]) {
      const ids = [];
      for (let page = 1; (page - 1) * 100 < count; page++) {
        const response = await repository.findAll({}, page, 100);
        assert.equal(response.total, count);
        ids.push(...response.data.map(item => item.id));
      }
      assert.equal(ids.length, count);
      assert.equal(new Set(ids).size, count, 'Pagination must not repeat or omit imported records');
    }
    const stocked = plan.rows.find(row => row.active && row.stock > 1 && row.price > 0);
    await db.collection('stocks').updateOne({ product: new mongoose.Types.ObjectId(stocked.id), branch }, { $inc: { quantity: -1 } });
    const again = await importPlan(db, plan, { apply: true, stockConfirmed: true, testDatabase: true });
    assert.equal(again.alreadyImported, true);
    assert.equal((await db.collection('stocks').findOne({ product: new mongoose.Types.ObjectId(stocked.id), branch })).quantity, stocked.stock - 1);
    assert.equal(await db.collection('stock_movements').countDocuments(), 503);
    assert.equal(EJSON.stringify(await db.collection('stocks').find({ branch: otherBranch }).toArray()), before);
    assert.equal((await db.collection('billing_counters').findOne({ _id: 'production:BAG1' })).next, 3);
  } finally {
    await client?.close();
    if (mongo.exitCode === null) { const stopped = once(mongo, 'exit'); mongo.kill('SIGTERM'); await stopped; }
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
