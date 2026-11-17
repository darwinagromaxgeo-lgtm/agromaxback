const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const mongoose = require('mongoose');
const { EJSON } = require('bson');
const { ProductSchema } = require('../dist/infrastructure/database/mongodb/schemas/product.schema');

const ROOT = path.resolve(__dirname, '../..');
const REVIEW = path.join(ROOT, '.runtime/importacion-sausal');
const plan = JSON.parse(fs.readFileSync(path.join(REVIEW, 'plan.json')));
const taxReview = JSON.parse(fs.readFileSync(path.join(REVIEW, 'propuesta-igv.json')));
const branchId = new mongoose.Types.ObjectId('6afc81d97f4a7356045dfcc1');
const companyId = new mongoose.Types.ObjectId('6af1363860fe67efe2d61bec');
const batchId = `sausal-catalog-${plan.workbookHash.slice(0, 24)}`;
const oid = key => new mongoose.Types.ObjectId(createHash('sha256').update(`agromax:${branchId}:${key}`).digest('hex').slice(0, 24));
const hash = data => createHash('sha256').update(EJSON.stringify(data, { relaxed: false })).digest('hex');
const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();

function categoryFor(candidate, tax) {
  if (['UREA', 'SULFATO AMONIO', 'CLORURO POTASIO', 'FOSFATO POTASIO', 'MOLIMAX', 'FERTILIZANTE BIOTERRA'].includes(normalize(candidate.name))) return 'Fertilizantes';
  if ([76, 77, 78].includes(candidate.index)) return 'Semillas';
  if (tax.proposal === 'GRAVADO PROPUESTO') {
    for (const [pattern, name] of [[/insecticida/i, 'Insecticidas'], [/herbicida/i, 'Herbicidas'], [/fungicida/i, 'Fungicidas'], [/acaricida/i, 'Acaricidas'], [/nematicida/i, 'Nematicidas'], [/regulador/i, 'Reguladores de crecimiento'], [/coadyuvante|acondicionador/i, 'Coadyuvantes']]) if (pattern.test(tax.family)) return name;
  }
  if (/bioestimul|nutrici[oó]n|fertilizante|carencia|foliar|enmienda/i.test(tax.family)) return 'Nutrición y bioestimulación';
  return 'Por clasificar';
}

async function run() {
  assert.equal(plan.branch, 'Sausal');
  assert.equal(plan.candidates.length, 219);
  assert.equal(plan.records.length, 221);
  assert.equal(taxReview.workbookHash, plan.workbookHash);
  const source = process.env.SAUSAL_INVENTORY_FILE || path.join(REVIEW, 'origen.xlsx');
  assert.equal(createHash('sha256').update(fs.readFileSync(source)).digest('hex'), plan.workbookHash);
  const taxByKey = new Map(taxReview.products.map(p => [p.importKey, p]));
  assert.equal(taxByKey.size, 219);
  const env = require('dotenv').parse(fs.readFileSync(path.join(ROOT, 'backend/.env')));
  const connection = await mongoose.createConnection(env.MONGODB_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 15000 }).asPromise();
  try {
    const db = connection.db;
    assert.equal(db.databaseName, 'agromax');
    const branch = await db.collection('branches').findOne({ _id: branchId, code: 'SAUSAL', isActive: true });
    assert.ok(branch && branch.companies.some(id => String(id) === String(companyId)));
    assert.ok(await db.collection('companies').findOne({ _id: companyId, ruc: '20609520478' }));
    const demoFilter = { name: /^\[DEMO\]/ };
    const demos = await db.collection('products').find(demoFilter).toArray();
    const existing = await db.collection('products').find({ 'catalogImport.branchId': String(branchId) }).toArray();
    const preview = { batchId, branch: 'Sausal', variants: 219, sourceRows: 221, alreadyImported: existing.length, demoProducts: demos.length, mode: process.argv.includes('--apply') ? 'apply' : 'dry-run', availableStockToAdd: 0, confirmedPricesToAdd: 0, gravadoFromReviewedProposal: taxReview.counts['GRAVADO PROPUESTO'], otherTaxesPending: 219 - taxReview.counts['GRAVADO PROPUESTO'] };
    if (!process.argv.includes('--apply')) { console.log(JSON.stringify(preview)); return; }

    const backupCollections = ['products', 'categories', 'units', 'stocks', 'product_lots', 'sales', 'billing_documents', 'billing_counters'];
    const backup = {};
    for (const name of backupCollections) backup[name] = await db.collection(name).find({}).sort({ _id: 1 }).toArray();
    const folder = path.join(REVIEW, 'respaldos'); fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
    const backupFile = path.join(folder, `${new Date().toISOString().replace(/[:.]/g, '-')}.ejson`);
    fs.writeFileSync(backupFile, EJSON.stringify({ capturedAt: new Date(), database: db.databaseName, batchId, collections: backup }, { relaxed: false }), { mode: 0o600, flag: 'wx' });
    const Product = connection.model('SausalImportValidation', ProductSchema, 'products');
    const session = await connection.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        const productsAtStart = await db.collection('products').find({}, { session }).toArray();
        const previousById = new Map(productsAtStart.map(p => [String(p._id), p]));
        const usedNames = new Set(productsAtStart.map(p => p.name));
        const categories = await db.collection('categories').find({}, { session }).toArray();
        const categoryMap = new Map(categories.map(c => [normalize(c.name), c._id]));
        const needed = new Set(['Por clasificar', ...plan.candidates.map(c => categoryFor(c, taxByKey.get(c.importKey)))]);
        const newCategories = [];
        for (const name of needed) if (!categoryMap.has(normalize(name))) {
          const _id = oid(`category:${name}`); categoryMap.set(normalize(name), _id);
          newCategories.push({ _id, name, description: 'Categoría del catálogo importado de Sausal', isActive: true, parentId: null, createdAt: new Date(), updatedAt: new Date() });
        }
        if (newCategories.length) await db.collection('categories').insertMany(newCategories, { session });
        const pendingCategoryId = String(categoryMap.get(normalize('Por clasificar')));
        const docs = [];
        let skipped = 0;
        for (const candidate of plan.candidates) {
          const _id = oid(candidate.importKey);
          const previous = previousById.get(String(_id));
          if (previous) {
            assert.equal(previous.catalogImport?.key, candidate.importKey, 'Colisión de clave de producto');
            assert.equal(previous.catalogImport?.branchId, String(branchId)); skipped++; continue;
          }
          assert.ok(!usedNames.has(candidate.proposedName), `Nombre ya usado: ${candidate.proposedName}`);
          usedNames.add(candidate.proposedName);
          const tax = taxByKey.get(candidate.importKey);
          const originalRows = plan.records.filter(row => candidate.sources.includes(row.source));
          const reviewNotes = [...new Set([tax.required, ...originalRows.flatMap(row => row.issues)])].filter(Boolean);
          const doc = {
            _id, externalId: `SAUSAL:${candidate.importKey}`, name: candidate.proposedName,
            description: `Presentación: ${candidate.presentation}. Catálogo Sausal; conteo original ${plan.sourceDate}.`,
            category: categoryMap.get(normalize(categoryFor(candidate, tax))), unit: 'PENDIENTE',
            taxType: tax.proposal === 'GRAVADO PROPUESTO' ? 'GRAVADO' : 'PENDIENTE',
            catalogStatus: 'PENDING_REVIEW', prices: [], activeIngredients: [], tracksLot: true, isActive: true,
            location: candidate.locations.join(' / '), locations: candidate.locations, minMarginPercent: 5,
            catalogImport: {
              key: candidate.importKey, branchId: String(branchId), branchName: 'Sausal', sourceFile: 'Inventario_Transcrito_Agromax_Sausal.xlsx', sourceDate: plan.sourceDate,
              presentation: candidate.presentation, sources: candidate.sources, pendingCategoryId, taxProposal: tax.proposal,
              reviewNotes, originalRows: originalRows.map(row => ({ source: row.source, quantity: row.quantityRaw, lot: row.lot, expiration: row.expiry.raw, state: row.state, notes: row.notes })),
            }, createdAt: new Date(), updatedAt: new Date(),
          };
          await new Product(doc).validate();
          docs.push(doc);
        }
        if (docs.length) await db.collection('products').insertMany(docs, { session });
        const deactivated = await db.collection('products').updateMany({ ...demoFilter, isActive: true }, { $set: { isActive: false, updatedAt: new Date() } }, { session });
        await db.collection('catalog_imports').updateOne({ _id: batchId }, { $setOnInsert: { branch: branchId, company: companyId, workbookHash: plan.workbookHash, sourceDate: plan.sourceDate, sourceFile: 'Inventario_Transcrito_Agromax_Sausal.xlsx', originalRecords: plan.records, productKeys: plan.candidates.map(c => c.importKey), createdAt: new Date() }, $set: { status: 'CATALOG_IMPORTED_STOCK_PENDING', completedAt: new Date() } }, { session, upsert: true });
        result = { ...preview, inserted: docs.length, skipped, demoDeactivated: deactivated.modifiedCount, categoriesCreated: newCategories.length, backupFile };
      });
    } finally { await session.endSession(); }
    const preserved = {};
    for (const name of ['sales', 'billing_documents', 'billing_counters', 'stocks', 'product_lots']) {
      preserved[name] = hash(await db.collection(name).find({}).sort({ _id: 1 }).toArray()) === hash(backup[name]);
    }
    result = { ...result, catalogImported: await db.collection('products').countDocuments({ 'catalogImport.branchId': String(branchId) }), pendingForSale: await db.collection('products').countDocuments({ 'catalogImport.branchId': String(branchId), catalogStatus: 'PENDING_REVIEW' }), activeDemos: await db.collection('products').countDocuments({ ...demoFilter, isActive: true }), preserved, checkedAt: new Date().toISOString() };
    fs.writeFileSync(path.join(REVIEW, 'resultado-carga.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
    assert.ok(Object.values(preserved).every(Boolean), 'Una colección histórica cambió durante la verificación; revisar el respaldo y el resultado sin revertir ventas del usuario.');
    assert.equal(result.catalogImported, 219); assert.equal(result.activeDemos, 0);
    console.log(JSON.stringify(result));
  } finally { await connection.close(); }
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });
