const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const XLSX = require('xlsx');
const mongoose = require('mongoose');
const { EJSON } = require('bson');

const ROOT = path.resolve(__dirname, '../..');
const BRANCH = '6afc81d97f4a7356045dfcc1';
const COMPANY = '6af1363860fe67efe2d61bec';
const RUC = '20609520478';
const SOURCE = process.env.SAUSAL_CATALOG_FILE || path.join(ROOT, '.runtime/catalogo-sausal-20261117/origen.xlsx');
const SOURCE_HASH = '2720bf445d15c9e9908655bd0cff8f2d8793f7cf357abf51383fc15b46b6ff3f';
const OUTPUT = path.join(ROOT, '.runtime/catalogo-sausal-20261117');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const oid = key => new mongoose.Types.ObjectId(sha(`agromax-catalog:${RUC}:${key}`).slice(0, 24));
const normal = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
const digest = rows => sha(EJSON.stringify(rows, { relaxed: false }));
const privateWrite = (filename, content) => {
  fs.mkdirSync(OUTPUT, { recursive: true, mode: 0o700 });
  const destination = path.join(OUTPUT, filename);
  fs.writeFileSync(destination, content, { mode: 0o600 });
  fs.chmodSync(destination, 0o600);
};

function number(value, field, row) {
  assert.ok(/^-?\d+(\.\d+)?$/.test(String(value).trim()), `Número no válido en ${field}, fila ${row}`);
  const result = Number(value);
  assert.ok(Number.isFinite(result), `Número no finito en ${field}, fila ${row}`);
  return result;
}

function displayName(value) {
  let text = String(value).trim().replace(/\s+/g, ' ');
  // Strip only a repeated label, preserving formulation and package contents.
  const compact = s => normal(s).replace(/[^A-Z0-9]/g, '');
  if (text.endsWith(')')) {
    for (let i = 1; i < text.length; i++) {
      if (text[i] === '(' && compact(text.slice(0, i)) === compact(text.slice(i + 1, -1))) {
        text = text.slice(0, i).trim(); break;
      }
    }
  }
  if (/^\([^()]+\)$/.test(text)) text = text.slice(1, -1).trim();
  return text;
}

function categoryFor(line) {
  const value = normal(line);
  if (/SEMILL/.test(value)) return 'Semillas';
  if (/HERBIC/.test(value)) return 'Herbicidas';
  if (/FUNGIC|FUNGIS/.test(value)) return 'Fungicidas';
  if (/NEMATIC/.test(value)) return 'Nematicidas';
  if (/ACARIC/.test(value)) return 'Acaricidas';
  if (/INSECT/.test(value)) return 'Insecticidas';
  if (/RIEGO/.test(value)) return 'Riego';
  if (/JACTO|PUL\. AGRIC|HERRAMIENT|ACCESORIOS/.test(value)) return 'Herramientas';
  if (/MATERIAL DE MARKETING/.test(value)) return 'Material promocional';
  if (/CUADY|COADY|ACIDIFIC|ACONDICIONADOR DE AGUA|REGULADOR DE (PH|AGUA)|ACEITE AGRICOLA/.test(value)) return 'Coadyuvantes';
  if (/ENMIENDA|EMMIENDA|EXTRACTOS HUMICOS|ABONO/.test(value)) return 'Enmiendas y abonos';
  if (/REGULADOR.*CREC|REGULADOR.*DESARROLLO|HORMON|CITOQUININ/.test(value)) return 'Reguladores de crecimiento';
  if (/FOLIAR|FOLIARES|ZINC FLOABLE/.test(value)) return 'Foliares';
  if (/FERTILIZANTE|FERTILIZANTES/.test(value)) return 'Fertilizantes';
  if (/BIOESTIMUL|BIO ESTIMUL|BIOSTIMUL|BIOACTIVADOR|ENRAIZ|NUTRIENTE/.test(value)) return 'Nutrición y bioestimulación';
  return 'Otros productos';
}

function preparePlan(filename = SOURCE) {
  const bytes = Buffer.isBuffer(filename) ? filename : fs.readFileSync(filename);
  const workbookHash = sha(bytes);
  const book = XLSX.read(bytes, { type: 'buffer', cellDates: false });
  assert.deepEqual(book.SheetNames, ['Productos']);
  const data = XLSX.utils.sheet_to_json(book.Sheets.Productos, { defval: '', raw: false });
  assert.ok(data.length > 0);
  for (const field of ['SKU', 'IVA', 'Nombre del Producto', 'Control Stock', 'Presentación', 'Equivalencia', 'Precio Vta.', 'Precio Ofe.', 'Estado Ofe.', 'Und. Medida', 'Und. Fiscal', 'Stock', 'Stock General', 'Estado Producto']) {
    assert.ok(Object.hasOwn(data[0], field), `Falta columna ${field}`);
  }
  const skuCount = new Map();
  for (const row of data) skuCount.set(normal(row.SKU), (skuCount.get(normal(row.SKU)) || 0) + 1);
  const rows = data.map((source, index) => {
    const excelRow = index + 2;
    const sku = String(source.SKU).trim();
    assert.ok(sku && source['Nombre del Producto'], `Falta identificación en fila ${excelRow}`);
    assert.equal(normal(source['Control Stock']), 'PRESENTACION');
    assert.equal(normal(source['Und. Medida']), 'UNIDAD');
    assert.equal(normal(source['Und. Fiscal']), 'NIU');
    assert.equal(number(source.Equivalencia, 'Equivalencia', excelRow), 1, 'No se convierten presentaciones automáticamente');
    const price = number(source['Precio Vta.'], 'Precio Vta.', excelRow);
    const offerPrice = number(source['Precio Ofe.'], 'Precio Ofe.', excelRow);
    const stock = number(source.Stock, 'Stock', excelRow);
    const generalStock = number(source['Stock General'], 'Stock General', excelRow);
    assert.ok(price >= 0 && offerPrice >= 0, `Precio negativo en fila ${excelRow}`);
    const taxType = { GRAVADO: 'GRAVADO', EXONERADO: 'EXONERADO' }[normal(source.IVA)];
    assert.ok(taxType, `IGV desconocido en fila ${excelRow}`);
    const active = normal(source['Estado Producto']) === 'ACTIVO';
    assert.ok(active || normal(source['Estado Producto']) === 'BAJA');
    const duplicateSku = skuCount.get(normal(sku)) > 1;
    const identity = `${normal(sku)}${duplicateSku ? ':' + normal(source['Nombre del Producto']) : ''}`;
    const key = `SAUSAL-EXPORT:${identity}`;
    const warnings = [];
    if (stock < 0) warnings.push('Saldo negativo del archivo: no se carga como existencia disponible.');
    if (!price) warnings.push('Sin precio de venta: producto pendiente para el POS.');
    if (duplicateSku) warnings.push('SKU repetido en el archivo: se conservan registros independientes, sin sumar existencias.');
    if (stock !== generalStock) warnings.push('Stock y Stock General difieren: se usa exclusivamente Stock confirmado para Sausal.');
    if (!active) warnings.push('Producto dado de baja en el archivo: permanece inactivo para ventas; se conserva su saldo válido en inventario.');
    return {
      excelRow, source, sku, key, id: String(oid(`product:${key}`)),
      name: displayName(source['Nombre del Producto']), presentation: String(source['Presentación']).trim(),
      category: categoryFor(source.Linea), taxType, price, offerPrice,
      offerActive: normal(source['Estado Ofe.']) === 'ACTIVO' && offerPrice > 0,
      stock, generalStock, active, duplicateSku, warnings,
      catalogStatus: price > 0 ? 'READY' : 'PENDING_REVIEW',
      stockStatus: stock < 0 ? 'PENDING_NEGATIVE' : active ? 'IMPORTED' : 'IMPORTED_INACTIVE',
    };
  });
  assert.equal(new Set(rows.map(row => row.key)).size, rows.length, 'Identidades repetidas sin resolver');
  const names = new Map();
  for (const row of rows) {
    row.name = `${row.name} — ${row.presentation}`;
    names.set(normal(row.name), (names.get(normal(row.name)) || 0) + 1);
  }
  for (const row of rows) if (names.get(normal(row.name)) > 1) row.name += ` [${row.sku}]`;
  assert.equal(new Set(rows.map(row => normal(row.name))).size, rows.length, 'Nombres indistinguibles sin resolver');
  const counts = {
    sourceRows: rows.length, active: rows.filter(row => row.active).length, inactive: rows.filter(row => !row.active).length,
    gravado: rows.filter(row => row.active && row.taxType === 'GRAVADO').length,
    exonerado: rows.filter(row => row.active && row.taxType === 'EXONERADO').length,
    withPrice: rows.filter(row => row.active && row.price > 0).length,
    noPrice: rows.filter(row => row.active && !row.price).length,
    positiveStock: rows.filter(row => row.active && row.stock > 0).length,
    zeroStock: rows.filter(row => row.active && row.stock === 0).length,
    negativeStock: rows.filter(row => row.active && row.stock < 0).length,
    fractionalStock: rows.filter(row => row.active && row.stock > 0 && !Number.isInteger(row.stock)).length,
    inactiveWithPositiveStock: rows.filter(row => !row.active && row.stock > 0).length,
    distinctDuplicateSkus: [...skuCount.values()].filter(count => count > 1).length,
    activeOffersPreserved: rows.filter(row => row.active && row.offerActive).length,
  };
  return { batchId: `sausal-export-${workbookHash.slice(0, 24)}`, workbookHash, sourceFile: 'Catálogo de Productos.xlsx', counts, rows };
}

async function importPlan(db, plan, { apply = false, stockConfirmed = false, testDatabase = false } = {}) {
  assert.ok(db.databaseName === 'agromax' || (testDatabase && db.databaseName.startsWith('agromax_test_sausal_')));
  const previousBatch = await db.collection('catalog_imports').findOne({ _id: plan.batchId });
  if (previousBatch?.status === 'COMPLETED') return { alreadyImported: true, batchId: plan.batchId, ...previousBatch.counts };
  const branchId = new mongoose.Types.ObjectId(BRANCH);
  const companyId = new mongoose.Types.ObjectId(COMPANY);
  const branch = await db.collection('branches').findOne({ _id: branchId, code: 'SAUSAL', isActive: true });
  assert.ok(branch && branch.companies.some(id => String(id) === COMPANY));
  assert.ok(await db.collection('companies').findOne({ _id: companyId, ruc: RUC }));
  const tier = await db.collection('price-tiers').findOne({ name: 'Minorista', isActive: { $ne: false } });
  assert.ok(tier);
  const old = await db.collection('products').find({ 'catalogImport.sourceFile': 'Inventario_Transcrito_Agromax_Sausal.xlsx', 'catalogImport.branchId': BRANCH, isActive: true }).toArray();
  assert.ok(old.every(p => p.catalogStatus === 'PENDING_REVIEW' && p.unit === 'PENDIENTE' && !(p.prices || []).length && !p.imageUrl), 'Hay fichas anteriores enriquecidas manualmente; no se archivarán automáticamente');
  const oldIds = new Set(old.map(p => String(p._id)));
  const names = (await db.listCollections().toArray()).map(c => c.name).filter(name => !name.startsWith('system.'));
  const masters = new Set(['products', 'categories', 'units', 'price-tiers', 'companies', 'branches', 'users', 'catalog_imports']);
  const snapshots = {};
  for (const name of names) {
    snapshots[name] = await db.collection(name).find({}).sort({ _id: 1 }).toArray();
    if (!masters.has(name)) for (const doc of snapshots[name]) {
      const serialized = EJSON.stringify(doc);
      assert.ok(![...oldIds].some(id => serialized.includes(id)), 'Una ficha anterior tiene movimientos: ' + name);
    }
  }
  const summary = { batchId: plan.batchId, branch: 'Sausal', ...plan.counts, previousDraftsToArchive: old.length, stockRowsToLoad: plan.rows.filter(row => row.stock >= 0).length, priceMode: 'Precio Vta. minorista', offerMode: 'Referencia; sin activar descuentos', taxMode: 'IVA del Excel', stockUnit: 'Una unidad de la presentación; sin conversiones', apply };
  if (!apply) return summary;
  assert.equal(stockConfirmed, true, 'Se requiere confirmar que Stock es el saldo actual de Sausal');
  const now = new Date();
  const sourceDate = now.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
  const admin = await db.collection('users').findOne({ username: 'admin', role: 'ADMIN', isActive: true });
  assert.ok(admin);
  if (!testDatabase) privateWrite(`respaldo-${now.toISOString().replace(/[:.]/g, '-')}.ejson`, EJSON.stringify({ capturedAt: now, database: db.databaseName, sourceHash: plan.workbookHash, collections: snapshots }, { relaxed: false }));
  const categories = new Map((snapshots.categories || []).map(c => [normal(c.name), c._id]));
  const newCategories = [];
  for (const name of new Set(['Por clasificar', ...plan.rows.map(row => row.category)])) if (!categories.has(normal(name))) {
    const _id = oid(`category:${name}`); categories.set(normal(name), _id);
    newCategories.push({ _id, name, description: 'Categoría del catálogo de Sausal', isActive: true, parentId: null, createdAt: now, updatedAt: now });
  }
  const products = plan.rows.map(row => ({
    _id: new mongoose.Types.ObjectId(row.id), externalId: row.key, name: row.name,
    description: `Presentación de venta: ${row.presentation}. Línea del catálogo: ${row.source.Linea}. SKU: ${row.sku}.`,
    category: categories.get(normal(row.category)), unit: 'Unidad', taxType: row.taxType,
    catalogStatus: row.catalogStatus, tracksLot: false, isActive: row.active, activeIngredients: [],
    prices: row.price > 0 ? [{ priceTier: tier._id, company: companyId, branch: branchId, price: row.price }] : [],
    minMarginPercent: 5,
    catalogImport: {
      format: 'SAUSAL_EXPORT', key: row.key, branchId: BRANCH, branchName: 'Sausal', sourceFile: plan.sourceFile,
      sourceDate, sourceDateKind: 'USER_STOCK_CONFIRMATION', workbookHash: plan.workbookHash,
      presentation: row.presentation, sources: [`Productos!${row.excelRow}`], sourceSku: row.sku,
      pendingCategoryId: String(categories.get(normal('Por clasificar'))), taxConfiguration: 'SOURCE_EXCEL',
      baseSalePrice: row.price, offerSalePrice: row.offerPrice, offerActive: row.offerActive,
      sourceStock: row.stock, sourceGeneralStock: row.generalStock, stockStatus: row.stockStatus,
      sourceProductStatus: row.active ? 'ACTIVO' : 'BAJA', reviewNotes: row.warnings,
      originalExportRow: { excelRow: row.excelRow, ...row.source },
      originalRows: [{ source: `Productos!${row.excelRow}`, quantity: String(row.source.Stock), lot: '', expiration: '', state: row.source['Estado Producto'], notes: `SKU: ${row.sku}. Unidad fiscal: NIU. Equivalencia: 1. Precio Vta.: ${row.price}.` }],
    }, createdAt: now, updatedAt: now,
  }));
  const { ProductSchema } = require('../dist/infrastructure/database/mongodb/schemas/product.schema');
  const Product = mongoose.models.SausalExportValidation || mongoose.model('SausalExportValidation', ProductSchema, 'products');
  for (const product of products) await new Product(product).validate();
  const stocks = [], adjustments = [], movements = [];
  for (const row of plan.rows.filter(row => row.stock >= 0)) {
    const product = new mongoose.Types.ObjectId(row.id);
    stocks.push({ _id: oid(`stock:${BRANCH}:${row.key}`), product, company: companyId, branch: branchId, quantity: row.stock, lastUpdated: now, createdAt: now, updatedAt: now });
    if (row.stock <= 0) continue;
    const adjustmentId = oid(`adjustment:${plan.batchId}:${row.key}`);
    const reason = `Carga inicial Sausal · ${plan.sourceFile} · fila ${row.excelRow} · SKU ${row.sku}. Saldo confirmado por el usuario; sin conversión de presentaciones.`;
    adjustments.push({ _id: adjustmentId, product, company: companyId, branch: branchId, type: 'INCREASE', quantity: row.stock, previousQuantity: 0, newQuantity: row.stock, reason, adjustedBy: admin._id, date: now, createdAt: now, updatedAt: now });
    movements.push({ _id: oid(`movement:${plan.batchId}:${row.key}`), product, company: companyId, branch: branchId, movementType: 'ADJUSTMENT_IN', quantity: row.stock, previousStock: 0, newStock: row.stock, referenceId: adjustmentId, referenceType: 'StockAdjustment', description: reason, user: admin._id, date: now, createdAt: now, updatedAt: now });
  }
  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      assert.equal(await db.collection('catalog_imports').findOne({ _id: plan.batchId }, { session }), null, 'El lote ya existe');
      assert.equal(await db.collection('products').countDocuments({ _id: { $in: products.map(p => p._id) } }, { session }), 0, 'Las identidades nuevas ya existen');
      if (newCategories.length) await db.collection('categories').insertMany(newCategories, { session });
      await db.collection('products').insertMany(products, { session });
      for (const product of old) {
        const result = await db.collection('products').updateOne({ _id: product._id, updatedAt: product.updatedAt, catalogStatus: 'PENDING_REVIEW', isActive: true, prices: { $size: 0 }, unit: 'PENDIENTE' }, { $set: { isActive: false, updatedAt: now, 'catalogImport.supersededBy': plan.batchId, 'catalogImport.archiveReason': 'Sustituido por el catálogo completo de Sausal confirmado por el usuario' } }, { session });
        assert.equal(result.modifiedCount, 1, 'Una ficha anterior cambió durante la carga');
      }
      if (stocks.length) await db.collection('stocks').insertMany(stocks, { session });
      if (adjustments.length) await db.collection('stock_adjustments').insertMany(adjustments, { session });
      if (movements.length) await db.collection('stock_movements').insertMany(movements, { session });
      await db.collection('catalog_imports').insertOne({ _id: plan.batchId, status: 'COMPLETED', branch: branchId, company: companyId, workbookHash: plan.workbookHash, sourceFile: plan.sourceFile, sourceRows: plan.rows.map(row => ({ excelRow: row.excelRow, ...row.source })), counts: { ...summary, archivedDrafts: old.length, productsCreated: products.length, stocksCreated: stocks.length, kardexEntries: movements.length }, productIds: products.map(p => p._id), previousDraftIds: old.map(p => p._id), stockConfirmedAt: now, priceMode: 'BASE_SALE_PRICE', taxMode: 'SOURCE_EXCEL', createdAt: now, completedAt: now }, { session });
    });
  } finally { await session.endSession(); }
  const mutable = new Set(['products', 'categories', 'stocks', 'stock_movements', 'stock_adjustments', 'catalog_imports']);
  const preserved = {};
  for (const name of names.filter(name => !mutable.has(name))) preserved[name] = digest(await db.collection(name).find({}).sort({ _id: 1 }).toArray()) === digest(snapshots[name]);
  const otherBranchStocksBefore = (snapshots.stocks || []).filter(stock => String(stock.branch) !== BRANCH);
  const otherBranchStocksAfter = await db.collection('stocks').find({ branch: { $ne: branchId } }).sort({ _id: 1 }).toArray();
  preserved.otherBranchStocks = digest(otherBranchStocksBefore) === digest(otherBranchStocksAfter);
  const result = { ...summary, productsCreated: products.length, archivedDrafts: old.length, stocksCreated: stocks.length, kardexEntries: movements.length, categoriesCreated: newCategories.length, preserved, checkedAt: new Date().toISOString(), fiscalSubmissions: 0 };
  if (!testDatabase) privateWrite('resultado-carga.json', JSON.stringify(result, null, 2) + '\n');
  assert.ok(Object.values(preserved).every(Boolean), 'Se detectó un cambio simultáneo en datos fuera de la carga; revisar sin revertir operaciones de usuarios');
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  assert.ok(args.every(arg => ['--apply', '--stock-confirmed'].includes(arg)), 'Opciones desconocidas');
  const plan = preparePlan();
  assert.equal(plan.workbookHash, SOURCE_HASH);
  assert.equal(plan.rows.length, 627);
  privateWrite('plan.json', JSON.stringify(plan, null, 2) + '\n');
  const env = require('dotenv').parse(fs.readFileSync(path.join(ROOT, 'backend/.env')));
  const connection = await mongoose.createConnection(env.MONGODB_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 15000 }).asPromise();
  try { console.log(JSON.stringify(await importPlan(connection.db, plan, { apply: args.includes('--apply'), stockConfirmed: args.includes('--stock-confirmed') }), null, 2)); }
  finally { await connection.close(); }
}

module.exports = { preparePlan, importPlan, displayName, categoryFor, BRANCH, COMPANY, RUC, SOURCE };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
