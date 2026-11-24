require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const { BillingDocumentSchema } = require('../dist/infrastructure/database/mongodb/schemas/billing-document.schema');
const { BillingCreditNoteSchema } = require('../dist/infrastructure/database/mongodb/schemas/billing-credit-note.schema');
const { SaleSchema } = require('../dist/infrastructure/database/mongodb/schemas/sale.schema');
const { MongoBillingCreditNoteRepository } = require('../dist/infrastructure/database/mongodb/repositories/mongo-billing-credit-note.repository');
const { buildCreditNote } = require('../dist/application/services/credit-note-calculation');
const { cancelSaleInTransaction } = require('../dist/infrastructure/database/mongodb/sale-cancellation');
const oid = () => new mongoose.Types.ObjectId();
const accepted = { status: 'ACCEPTED', sunatCode: '0', sunatDescription: 'Respuesta simulada aceptada', cdrBase64: Buffer.from('PKfixture').toString('base64') };

async function fixture(t, { lots = false, credit = false } = {}) {
  assert.match(process.env.AGROMAX_TEST_MONGO_URI, /^mongodb:\/\/(127\.0\.0\.1|localhost):/);
  const connection = await mongoose.createConnection(process.env.AGROMAX_TEST_MONGO_URI, { dbName: 'void_sale_' + randomUUID().replaceAll('-', '') }).asPromise();
  t.after(async () => { await connection.dropDatabase(); await connection.close(); });
  const db = connection.db;
  const originals = connection.model('BillingDocument', BillingDocumentSchema.clone());
  const notes = connection.model('BillingCreditNote', BillingCreditNoteSchema.clone());
  const sales = connection.model('SaleDocument', SaleSchema.clone());
  const repository = new MongoBillingCreditNoteRepository(notes, originals, sales);
  await originals.init(); await repository.onModuleInit();
  const ids = { sale: oid(), branch: oid(), foreignBranch: oid(), company: oid(), product: oid(), user: oid(), lot: oid(), credit: oid(), cash: oid() };
  await db.collection('products').insertOne({ _id: ids.product, name: 'Producto de prueba', tracksLot: lots });
  await db.collection('stocks').insertMany([{ product: ids.product, company: ids.company, branch: ids.branch, quantity: 5 }, { product: ids.product, company: ids.company, branch: ids.foreignBranch, quantity: 90 }]);
  if (lots) await db.collection('product_lots').insertOne({ _id: ids.lot, product: ids.product, company: ids.company, branch: ids.branch, lotNumber: 'ORIGINAL', currentQuantity: 5, initialQuantity: 7 });
  await sales.create({ _id: ids.sale, branch: ids.branch, company: ids.company, items: [{ product: ids.product, company: ids.company, quantity: 2, unitPrice: 1, subtotal: 2, priceTier: 'Minorista', ...(lots ? { lotAllocations: [{ lotId: ids.lot, quantity: 2 }] } : {}) }], total: 2, voucherType: 'BOLETA', isCredit: credit, payments: credit ? [] : [{ paymentMethodName: 'Efectivo', amount: 2 }], date: new Date() });
  if (credit) await db.collection('credit_accounts').insertOne({ _id: ids.credit, branch: ids.branch, sales: [ids.sale], totalAmount: 2, paidAmount: 1, pendingAmount: 1, status: 'PARTIAL', payments: [{ amount: 1, cashRegisterEntryId: ids.cash }] });
  const cash = { _id: ids.cash, type: 'INCOME', category: credit ? 'CREDIT_PAYMENT' : 'SALE', referenceId: credit ? ids.credit : ids.sale, referenceType: credit ? 'CreditAccount' : 'Sale', amount: credit ? 1 : 2, paymentMethodName: 'Efectivo', voucherType: 'BOLETA', isDeleted: false, editHistory: [] };
  await db.collection('cash_registers').insertMany([{ branch: ids.branch, status: 'OPEN', date: '2026-11-23', entries: [cash], __v: 0 }, { branch: ids.foreignBranch, status: 'OPEN', entries: [cash], __v: 0 }]);
  const stage = async (taxType = 'GRAVADO', flag = true) => {
    const source = { id: String(oid()), branchId: String(ids.branch), companyId: String(ids.company), saleId: String(ids.sale), documentType: 'BOLETA', status: 'ACCEPTED', hasCdr: true, series: 'BAG3', number: taxType === 'GRAVADO' ? 1 : 2, environment: 'beta', submittedAt: new Date(), currency: 'PEN', taxType, issuer: { name: 'Emisor de prueba', documentType: 'RUC', documentNumber: '20600000001' }, receiver: { name: 'Consumidor final', documentType: 'UNIDENTIFIED' }, paymentCondition: credit ? 'CREDITO' : 'CONTADO', saleDate: new Date(), warnings: [], legacyTaxData: false, items: [{ productId: String(ids.product), description: 'Producto de prueba', unit: 'UND', quantity: 2, unitPrice: 1, taxType, taxRate: taxType === 'GRAVADO' ? .18 : 0, baseAmount: taxType === 'GRAVADO' ? 1.69 : 2, taxAmount: taxType === 'GRAVADO' ? .31 : 0, total: 2 }], taxableAmount: taxType === 'GRAVADO' ? 1.69 : 0, exemptAmount: taxType === 'EXONERADO' ? 2 : 0, unaffectedAmount: 0, taxAmount: taxType === 'GRAVADO' ? .31 : 0, total: 2 };
    const { id, branchId, companyId, saleId, ...data } = source;
    await originals.create({ _id: id, branch: branchId, company: companyId, sale: saleId, ...data });
    const note = await repository.createDraft(id, branchId, randomUUID(), randomUUID(), () => ({ ...buildCreditNote(source, [], { returnType: 'CANCEL', reason: 'Venta registrada por error; no se realizó' }), ...(flag ? { cancelSaleOnAcceptance: true } : {}), createdBy: String(ids.user) }));
    await repository.claimDraft(note.id, branchId, String(ids.user));
    return { note, source };
  };
  return { connection, db, ids, originals, notes, sales, repository, stage };
}

const options = { skip: !process.env.AGROMAX_TEST_MONGO_URI };
test('accepted cancellation reverses sale, cash and its own branch stock exactly once across concurrent replies', options, async t => {
  const f = await fixture(t, { lots: true });
  const { note, source } = await f.stage();
  await f.repository.saveResult(note.id, String(f.ids.branch), { status: 'PENDING', sunatDescription: 'En proceso' });
  assert.equal((await f.sales.findById(f.ids.sale).lean()).isCancelled, false);
  assert.equal((await f.db.collection('stocks').findOne({ branch: f.ids.branch })).quantity, 5);
  await Promise.all([f.repository.saveResult(note.id, String(f.ids.branch), accepted), f.repository.saveResult(note.id, String(f.ids.branch), accepted)]);
  const sale = await f.sales.findById(f.ids.sale).lean();
  assert.equal(sale.isCancelled, true); assert.equal(sale.voucherType, 'BOLETA'); assert.ok(sale.cancelledAt); assert.equal(String(sale.cancelledBy), String(f.ids.user));
  assert.equal((await f.db.collection('stocks').findOne({ branch: f.ids.branch })).quantity, 7);
  assert.equal((await f.db.collection('stocks').findOne({ branch: f.ids.foreignBranch })).quantity, 90);
  assert.equal((await f.db.collection('product_lots').findOne({ _id: f.ids.lot })).currentQuantity, 7);
  assert.equal(await f.db.collection('stock_movements').countDocuments({ referenceType: 'SaleCancellation' }), 1);
  assert.equal((await f.db.collection('cash_registers').findOne({ branch: f.ids.branch })).entries[0].isDeleted, true);
  assert.equal((await f.db.collection('cash_registers').findOne({ branch: f.ids.foreignBranch })).entries[0].isDeleted, false);
  assert.equal((await f.originals.findById(source.id).lean()).status, 'ACCEPTED');
  assert.ok((await f.repository.findById(note.id, String(f.ids.branch))).saleCancelledAt);
  await f.connection.transaction(session => cancelSaleInTransaction(f.db, session, f.ids.sale, f.ids.branch, 'Reintento', f.ids.user));
  assert.equal(await f.db.collection('stock_movements').countDocuments(), 1);
});

test('multiple fiscal documents wait for the final accepted cancellation', options, async t => {
  const f = await fixture(t);
  await f.sales.updateOne({ _id: f.ids.sale }, { $set: { total: 4, 'items.0.quantity': 4, 'items.0.subtotal': 4 } });
  const first = await f.stage(), second = await f.stage('EXONERADO', false);
  await f.repository.saveResult(first.note.id, String(f.ids.branch), accepted);
  assert.equal((await f.sales.findById(f.ids.sale).lean()).isCancelled, false);
  assert.equal(await f.db.collection('stock_movements').countDocuments(), 0);
  await f.repository.saveResult(second.note.id, String(f.ids.branch), accepted);
  assert.equal((await f.sales.findById(f.ids.sale).lean()).isCancelled, true);
  assert.equal((await f.db.collection('stocks').findOne({ branch: f.ids.branch })).quantity, 9);
  assert.equal(await f.db.collection('stock_movements').countDocuments(), 1);
});

test('single-sale credit cancellation clears debt and reverses collected deposits without claiming it was paid', options, async t => {
  const f = await fixture(t, { credit: true });
  const { note } = await f.stage();
  await f.repository.saveResult(note.id, String(f.ids.branch), accepted);
  const credit = await f.db.collection('credit_accounts').findOne({ _id: f.ids.credit });
  assert.equal(credit.status, 'CANCELLED'); assert.equal(credit.pendingAmount, 0); assert.equal(credit.paidAmount, 1); assert.equal(credit.payments.length, 1);
  assert.equal((await f.db.collection('cash_registers').findOne({ branch: f.ids.branch })).entries[0].isDeleted, true);
});

test('a failure rolls back note acceptance, sale, stock and money together', options, async t => {
  const f = await fixture(t);
  const { note, source } = await f.stage();
  await f.sales.updateOne({ _id: f.ids.sale }, { $push: { items: { product: oid(), company: f.ids.company, quantity: 1, unitPrice: 1, subtotal: 1, priceTier: 'Minorista' } } });
  await assert.rejects(f.repository.saveResult(note.id, String(f.ids.branch), accepted), /ficha principal/);
  assert.equal((await f.sales.findById(f.ids.sale).lean()).isCancelled, false);
  assert.equal((await f.originals.findById(source.id).lean()).activeSlot, true);
  assert.equal((await f.repository.findById(note.id, String(f.ids.branch))).status, 'SENDING');
  assert.equal((await f.db.collection('stocks').findOne({ branch: f.ids.branch })).quantity, 5);
  assert.equal(await f.db.collection('stock_movements').countDocuments(), 0);
  assert.equal((await f.db.collection('cash_registers').findOne({ branch: f.ids.branch })).entries[0].isDeleted, false);
});

test('old fiscal-only cancellations do not retroactively reverse an active sale', options, async t => {
  const f = await fixture(t);
  const { note } = await f.stage('GRAVADO', false);
  await f.repository.saveResult(note.id, String(f.ids.branch), accepted);
  const sale = await f.sales.findById(f.ids.sale).lean();
  assert.equal(sale.isCancelled, false); assert.equal(sale.voucherType, 'NONE');
  assert.equal((await f.db.collection('stocks').findOne({ branch: f.ids.branch })).quantity, 5);
});

test('shared credit payments require review before reserving or submitting a cancellation', options, async t => {
  const f = await fixture(t, { credit: true });
  const other = oid();
  await f.db.collection('sales').insertOne({ _id: other, branch: f.ids.branch, isCancelled: false, total: 3 });
  await f.db.collection('credit_accounts').updateOne({ _id: f.ids.credit }, { $push: { sales: other }, $set: { totalAmount: 5, pendingAmount: 4 } });
  await assert.rejects(f.stage(), /comparte un crédito/);
  assert.equal(await f.notes.countDocuments(), 0);
  assert.equal((await f.sales.findById(f.ids.sale).lean()).isCancelled, false);
});

test('consolidated historical products restore the canonical stock while their sale reference stays intact', options, async t => {
  const f = await fixture(t);
  const principal = f.ids.product, alias = oid();
  await f.db.collection('products').insertOne({ _id: alias, name: 'Ficha anterior BON', isActive: false, catalogImport: { deduplication: { inventoryConsolidated: true, canonicalProductId: String(principal) } } });
  await f.sales.updateOne({ _id: f.ids.sale }, { $set: { 'items.0.product': alias } });
  f.ids.product = alias;
  const { note } = await f.stage();
  await f.repository.saveResult(note.id, String(f.ids.branch), accepted);
  assert.equal((await f.db.collection('stocks').findOne({ product: principal, branch: f.ids.branch })).quantity, 7);
  assert.equal(await f.db.collection('stocks').countDocuments({ product: alias }), 0);
  assert.equal(String((await f.sales.findById(f.ids.sale).lean()).items[0].product), String(alias));
  assert.equal(String((await f.db.collection('stock_movements').findOne({})).product), String(principal));
});

test('a missing canonical product prevents any partial inventory return', options, async t => {
  const f = await fixture(t);
  const { note } = await f.stage();
  await f.db.collection('products').updateOne({ _id: f.ids.product }, { $set: { catalogImport: { deduplication: { inventoryConsolidated: true, canonicalProductId: String(oid()) } } } });
  await assert.rejects(f.repository.saveResult(note.id, String(f.ids.branch), accepted), /ficha principal/);
  assert.equal((await f.sales.findById(f.ids.sale).lean()).isCancelled, false);
  assert.equal((await f.db.collection('stocks').findOne({ branch: f.ids.branch })).quantity, 5);
  assert.equal(await f.db.collection('stock_movements').countDocuments(), 0);
});

test('an unpaid grouped credit loses only the cancelled sale and preserves its other debt', options, async t => {
  const f = await fixture(t, { credit: true });
  const other = oid();
  await f.db.collection('sales').insertOne({ _id: other, branch: f.ids.branch, isCancelled: false, total: 3 });
  await f.db.collection('credit_accounts').updateOne({ _id: f.ids.credit }, { $push: { sales: other }, $set: { totalAmount: 5, paidAmount: 0, pendingAmount: 5, payments: [] } });
  await f.db.collection('cash_registers').updateOne({ branch: f.ids.branch }, { $set: { entries: [] } });
  const { note } = await f.stage();
  await f.repository.saveResult(note.id, String(f.ids.branch), accepted);
  const credit = await f.db.collection('credit_accounts').findOne({ _id: f.ids.credit });
  assert.equal(credit.totalAmount, 3); assert.equal(credit.pendingAmount, 3); assert.equal(credit.status, 'PENDING');
  assert.equal((await f.db.collection('sales').findOne({ _id: other })).isCancelled, false);
});

test('old lot sales without allocations use a traceable return lot instead of changing another lot', options, async t => {
  const f = await fixture(t, { lots: true });
  await f.sales.updateOne({ _id: f.ids.sale }, { $unset: { 'items.0.lotAllocations': 1 } });
  const { note } = await f.stage();
  await f.repository.saveResult(note.id, String(f.ids.branch), accepted);
  const lots = await f.db.collection('product_lots').find({ branch: f.ids.branch }).toArray();
  assert.equal(lots.find(lot => String(lot._id) === String(f.ids.lot)).currentQuantity, 5);
  const returned = lots.find(lot => lot.lotNumber.startsWith('DEV-'));
  assert.equal(returned.currentQuantity, 2); assert.equal(returned.expirationDate, undefined);
  assert.equal(lots.reduce((sum, lot) => sum + lot.currentQuantity, 0), 7);
});
