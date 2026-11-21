require('reflect-metadata');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { Module, Injectable } = require('@nestjs/common');
const { NestFactory, Reflector } = require('@nestjs/core');
const { ConfigService } = require('@nestjs/config');
const axios = require('axios');
const { BillingService } = require('../dist/application/services/billing.service');
const { calculateBillingItem } = require('../dist/application/services/billing-calculation');
const { GreenterBillingProvider } = require('../dist/infrastructure/billing/greenter-billing.provider');
const { BillingController } = require('../dist/presentation/controllers/billing.controller');
const { BranchAccessGuard } = require('../dist/presentation/guards/branch-access.guard');
const { RolesGuard } = require('../dist/presentation/guards/roles.guard');
const { validationPipe } = require('../dist/presentation/pipes/validation.pipe');
const { ResponseTransformInterceptor } = require('../dist/presentation/interceptors/response-transform.interceptor');
const { HttpExceptionFilter } = require('../dist/presentation/filters/http-exception.filter');
const { CancelSaleUseCase } = require('../dist/application/use-cases/sale/cancel-sale.use-case');
const { DeleteEntryUseCase } = require('../dist/application/use-cases/cash-register/delete-entry.use-case');
const { DeleteCreditUseCase } = require('../dist/application/use-cases/credit-account/delete-credit.use-case');
const { BillingDocumentSchema, BillingCounterSchema } = require('../dist/infrastructure/database/mongodb/schemas/billing-document.schema');
const { MongoSaleRepository } = require('../dist/infrastructure/database/mongodb/repositories/mongo-sale.repository');
const { LookupService } = require('../dist/application/services/lookup.service');
const { of } = require('rxjs');
const { readdirSync } = require('node:fs');
const path = require('node:path');

test('Mongo reference paths use ObjectId schema types instead of uncast Mixed fields', () => {
  const folder = path.join(__dirname, '../dist/infrastructure/database/mongodb/schemas');
  let checked = 0;
  const inspect = schema => {
    schema.eachPath((name, field) => {
      if (field.options?.ref) { assert.equal(field.instance, 'ObjectId', name); checked++; }
      if (field.caster?.options?.ref) { assert.equal(field.caster.instance, 'ObjectId', name); checked++; }
      if (field.schema) inspect(field.schema);
    });
  };
  for (const name of readdirSync(folder).filter(name => name.endsWith('.schema.js'))) {
    for (const value of Object.values(require(path.join(folder, name)))) if (value?.eachPath && value?.paths) inspect(value);
  }
  assert.ok(checked >= 50, 'Expected all operational reference fields to be checked');
});

const ids = Object.fromEntries(['branch', 'company', 'client', 'sale', 'gravado', 'exonerado', 'inafecto', 'user', 'foreign'].map((key, index) => [key, String(index + 1).padStart(24, '0')]));
const clone = value => structuredClone(value);

function fixture() {
  const branch = { id: ids.branch, name: 'Central', isActive: true, companyIds: [ids.company] };
  const company = { id: ids.company, name: 'Empresa agrícola', ruc: '20100070970', address: 'Dirección de prueba', isActive: true };
  const client = { id: ids.client, branchId: ids.branch, name: 'Cliente de prueba', documentNumber: '20600000001', isActive: true };
  const products = new Map([
    [ids.gravado, { id: ids.gravado, name: 'Producto gravado', unit: 'KG', taxType: 'GRAVADO', isActive: true }],
    [ids.exonerado, { id: ids.exonerado, name: 'Producto exonerado', unit: 'UND', taxType: 'EXONERADO', isActive: true }],
    [ids.inafecto, { id: ids.inafecto, name: 'Producto inafecto', unit: 'L', taxType: 'INAFECTO', isActive: true }],
  ]);
  const sale = {
    id: ids.sale, branchId: ids.branch, clientId: ids.client, date: new Date('2026-11-14T17:00:00Z'), total: 198, isCredit: false, isCancelled: false,
    items: [
      { productId: ids.gravado, productName: 'Producto gravado', companyId: ids.company, quantity: 2, unitPrice: 59, subtotal: 118, unit: 'KG', taxType: 'GRAVADO', taxRate: .18 },
      { productId: ids.exonerado, productName: 'Producto exonerado', companyId: ids.company, quantity: 1, unitPrice: 50, subtotal: 50, unit: 'UND', taxType: 'EXONERADO', taxRate: 0 },
      { productId: ids.inafecto, productName: 'Producto inafecto', companyId: ids.company, quantity: 1, unitPrice: 30, subtotal: 30, unit: 'L', taxType: 'INAFECTO', taxRate: 0 },
    ],
  };
  const records = new Map();
  const counters = new Map();
  const calls = { create: 0, submit: 0, poll: 0, reserve: 0 };
  const documents = {
    findCancelledForSale: async (saleId,companyId,taxType,branchId) => clone([...records.values()].find(doc=>doc.saleId===saleId&&doc.companyId===companyId&&doc.taxType===taxType&&doc.branchId===branchId&&doc.cancelledByCreditNoteId) || null),
    findAll: async (filter, page, limit) => { const values = [...records.values()].filter(doc => doc.branchId === filter.branchId); return { data: clone(values.slice((page - 1) * limit, page * limit)), total: values.length }; },
    findById: async (id, branchId) => { const doc = records.get(id); return doc?.branchId === branchId ? clone(doc) : null; },
    findForSale: async (saleId, companyId, taxType, branchId) => clone([...records.values()].find(doc => doc.saleId === saleId && doc.companyId === companyId && doc.taxType === taxType && doc.branchId === branchId && doc.status !== 'DISCARDED') || null),
    hasSubmittedSale: async saleId => [...records.values()].some(doc => doc.saleId === saleId && ['SENDING', 'PENDING', 'ACCEPTED', 'UNKNOWN'].includes(doc.status)),
    hasActiveSale: async saleId => [...records.values()].some(doc => doc.saleId === saleId && doc.status !== 'DISCARDED'),
    createDraft: async doc => { calls.create++; const saved = clone({ ...doc, id: String(100 + calls.create).padStart(24, '0'), createdAt: new Date() }); records.set(saved.id, saved); return clone(saved); },
    discard: async (id, branchId, reason) => { const doc = records.get(id); if (!doc || doc.branchId !== branchId || doc.status !== 'DRAFT') return null; Object.assign(doc, { status: 'DISCARDED', discardReason: reason }); return clone(doc); },
    claimDraft: async (id, branchId, userId, revision) => { const doc = records.get(id); if (!doc || doc.branchId !== branchId || doc.status !== 'DRAFT' || (revision !== undefined && revision !== (doc.receiverRevision || 0))) return null; Object.assign(doc, { status: 'SENDING', submittedBy: userId, submittedAt: new Date() }); return clone(doc); },
    updateReceiver: async (id, branchId, receiver, userId, revision) => { const doc = records.get(id); if (!doc || doc.branchId !== branchId || doc.status !== 'DRAFT' || revision !== (doc.receiverRevision || 0)) return null; Object.assign(doc, { receiver: clone(receiver), receiverRevision: revision + 1, receiverUpdatedBy: userId }); return clone(doc); },
    reserveNumber: async (ruc, series, environment, start) => { calls.reserve++; const key = `${ruc}:${series}:${environment}`; const next = (counters.get(key) ?? start - 1) + 1; counters.set(key, next); return next; },
    setSubmission: async (id, branchId, data) => Object.assign(records.get(id), clone(data)),
    saveSubmissionResult: async (id, branchId, result) => { const doc = records.get(id); Object.assign(doc, clone(result)); return clone(doc); },
    getArtifact: async () => ({ data: Buffer.from('%PDF-billing-test').toString('base64'), filename: 'F001-00000001.pdf' }),
  };
  const provider = {
    getStatus: async () => ({ configured: true, ready: true, issuerRuc: company.ruc, issuerName: company.name, environment: 'beta', series: { FACTURA: 'F001', BOLETA: 'B001' }, supportedDocumentTypes: ['FACTURA', 'BOLETA'], message: 'Prueba' }),
    getNumberingStart: () => 11,
    submit: async () => { calls.submit++; return { status: 'ACCEPTED', sunatCode: '0', sunatDescription: 'Respuesta simulada' }; },
    checkStatus: async () => { calls.poll++; return { status: 'ACCEPTED', sunatCode: '0', sunatDescription: 'Resumen aceptado simulado' }; },
  };
  const sales = { findById: async id => id === ids.sale ? clone(sale) : null };
  const companies = { findById: async id => id === ids.company ? clone(company) : null };
  const clients = { findById: async id => id === ids.client ? clone(client) : null };
  const productRepo = { findById: async id => clone(products.get(id) || null) };
  const service = new BillingService(documents, sales, companies, clients, productRepo, provider);
  const input = { saleId: ids.sale, companyId: ids.company, documentType: 'FACTURA', taxType: 'GRAVADO' };
  return { branch, company, client, sale, products, records, calls, documents, provider, service, input };
}

test('mixed sale produces independent taxable, exempt and unaffected documents without duplicating the sale', async () => {
  const f = fixture();
  const groups = await f.service.saleGroups(ids.sale, f.branch);
  assert.deepEqual(groups.map(group => [group.taxType, group.total]), [['GRAVADO', 118], ['EXONERADO', 50], ['INAFECTO', 30]]);
  for (const [taxType, total, tax] of [['GRAVADO', 118, 18], ['EXONERADO', 50, 0], ['INAFECTO', 30, 0]]) {
    const doc = await f.service.createDraft({ ...f.input, taxType }, f.branch, ids.user);
    assert.equal(doc.total, total); assert.equal(doc.taxAmount, tax);
    assert.ok(doc.items.every(item => item.taxType === taxType));
  }
  assert.equal(f.calls.create, 3); assert.equal(f.calls.submit, 0);
  assert.equal(f.sale.total, 198); assert.equal(f.sale.items.length, 3);
});

test('repeated draft is idempotent; a different document type requires discarding the draft first', async () => {
  const f = fixture();
  const first = await f.service.createDraft(f.input, f.branch, ids.user);
  assert.equal((await f.service.createDraft(f.input, f.branch, ids.user)).id, first.id);
  assert.equal(f.calls.create, 1);
  await assert.rejects(f.service.createDraft({ ...f.input, documentType: 'BOLETA' }, f.branch, ids.user), /otro tipo/);
  await f.service.discard(first.id, ids.branch, 'Tipo corregido', ids.user);
  const replacement = await f.service.createDraft({ ...f.input, documentType: 'BOLETA' }, f.branch, ids.user);
  assert.notEqual(first.id, replacement.id);
});

test('local simulation preserves drafts, sales and counters without any provider request', async () => {
  const f = fixture();
  f.provider.getStatus = async () => { throw new Error('Simulation must not contact a billing provider'); };
  for (const taxType of ['GRAVADO', 'EXONERADO', 'INAFECTO']) {
    const doc = await f.service.createDraft({ ...f.input, taxType }, f.branch, ids.user);
    const stored = clone(f.records.get(doc.id)); const sale = clone(f.sale);
    for (let repeat = 0; repeat < 2; repeat++) {
      const result = await f.service.simulate(doc.id, ids.branch);
      assert.equal(result.simulation, true); assert.equal(result.status, 'SIMULATED');
      assert.equal(result.document.status, 'DRAFT'); assert.equal(result.dataReady, true);
      assert.equal(result.document.series, undefined); assert.equal(result.document.number, undefined);
      assert.equal(result.document.sunatCode, undefined); assert.equal(result.document.hasCdr, undefined);
      assert.match(result.message, /sin validez tributaria/);
    }
    assert.deepEqual(f.records.get(doc.id), stored); assert.deepEqual(f.sale, sale);
  }
  assert.equal(f.calls.submit, 0); assert.equal(f.calls.reserve, 0); assert.equal(f.calls.poll, 0);
});

test('simulation identifies incomplete data and enforces branch and draft boundaries', async () => {
  const f = fixture(); f.sale.isCredit = true; f.sale.clientId = undefined;
  f.sale.items[0].unit = 'UNIDAD_DESCONOCIDA';
  const doc = await f.service.createDraft({ ...f.input, documentType: 'BOLETA' }, f.branch, ids.user);
  const result = await f.service.simulate(doc.id, ids.branch);
  assert.equal(result.dataReady, false); assert.equal(result.checks.filter(check => !check.passed).length, 2);
  await assert.rejects(f.service.simulate(doc.id, ids.foreign), /sucursal/);
  f.records.get(doc.id).status = 'ACCEPTED';
  await assert.rejects(f.service.simulate(doc.id, ids.branch), /borradores/);
});

test('Decolecta identity lookup validates inputs and configuration before sending, and returns fiscal condition', async () => {
  const requests = [];
  const client = { get: (path, options) => { requests.push({ path, options }); return of({ data: { razon_social: 'Cliente simulado', direccion: 'Dirección simulada', estado: 'ACTIVO', condicion: 'HABIDO' } }); } };
  const disabled = new LookupService(client, new ConfigService());
  await assert.rejects(disabled.searchByRuc('20100070970'), /no está configurada/);
  const configured = new LookupService(client, new ConfigService({ DECOLECTA_API_KEY: 'test-lookup-key' }));
  await assert.rejects(configured.searchByDni('abc'), /8 dígitos/);
  await assert.rejects(configured.searchByRuc('../not-a-number'), /11 dígitos/);
  assert.equal(requests.length, 0);
  const result = await configured.searchByRuc('20100070970');
  assert.deepEqual(result, { razonSocial: 'Cliente simulado', direccion: 'Dirección simulada', estado: 'ACTIVO', condicion: 'HABIDO' });
  assert.equal(requests[0].path, '/sunat/ruc'); assert.equal(requests[0].options.headers.Authorization, 'Bearer test-lookup-key');
  assert.ok(!JSON.stringify(result).includes('test-lookup-key'));
});

test('foreign branches, disabled issuers, missing customer RUC and inconsistent totals are rejected', async () => {
  for (const [mutate, expected] of [
    [f => { f.sale.branchId = ids.foreign; }, /sucursal/],
    [f => { f.branch.companyIds = []; }, /habilitada/],
    [f => { f.company.isActive = false; }, /emisora/],
    [f => { f.client.documentNumber = '12345678'; }, /RUC/],
    [f => { f.client.branchId = ids.foreign; }, /sucursal/],
    [f => { f.sale.total = 199; }, /total/],
    [f => { f.sale.isCancelled = true; }, /anulada/],
  ]) { const f = fixture(); mutate(f); await assert.rejects(f.service.preview(f.input, f.branch), expected); }
});

test('legacy sales require explicit review, and the saved snapshot survives catalogue changes', async () => {
  const f = fixture();
  delete f.sale.items[0].taxType; delete f.sale.items[0].taxRate; delete f.sale.items[0].unit;
  assert.equal((await f.service.preview(f.input, f.branch)).legacyTaxData, true);
  await assert.rejects(f.service.createDraft(f.input, f.branch, ids.user), /Confirma/);
  const doc = await f.service.createDraft({ ...f.input, legacyTaxConfirmed: true }, f.branch, ids.user);
  f.products.get(ids.gravado).taxType = 'EXONERADO';
  const stored = await f.service.findById(doc.id, ids.branch);
  assert.equal(stored.taxAmount, 18); assert.equal(stored.items[0].taxType, 'GRAVADO');
});

test('new sales use their stored tax snapshot instead of a subsequently edited catalogue', async () => {
  const f = fixture(); f.products.get(ids.gravado).taxType = 'EXONERADO';
  const doc = await f.service.preview(f.input, f.branch);
  assert.equal(doc.taxAmount, 18); assert.equal(doc.legacyTaxData, false);
});

test('rounding keeps each line total equal to base plus tax, including small fractional amounts', () => {
  for (const subtotal of [.01, .02, .03, .1, 1, 118, 999.99]) {
    const item = calculateBillingItem({ productId: ids.gravado, description: 'Prueba', unit: 'KG', quantity: 1, unitPrice: subtotal, subtotal, taxType: 'GRAVADO', taxRate: .18 });
    assert.equal(Math.round(item.baseAmount * 100) + Math.round(item.taxAmount * 100), Math.round(subtotal * 100));
  }
  assert.throws(() => calculateBillingItem({ productId: 'x', description: 'x', unit: 'KG', quantity: 1, unitPrice: 1, subtotal: 1, taxType: 'GRAVADO', taxRate: 0 }), /tasa/);
});

test('parallel issue requests submit once and reserve a single fiscal number', async () => {
  const f = fixture(); const doc = await f.service.createDraft(f.input, f.branch, ids.user);
  const results = await Promise.allSettled([f.service.issue(doc.id, f.branch, ids.user), f.service.issue(doc.id, f.branch, ids.user)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(f.calls.submit, 1); assert.equal(f.calls.reserve, 1);
  const stored = await f.service.findById(doc.id, ids.branch);
  assert.equal(stored.status, 'ACCEPTED'); assert.equal(stored.number, 11);
  await assert.rejects(f.service.issue(doc.id, f.branch, ids.user), /procesado/);
});

test('numbering is shared by issuer/series across tax groups instead of restarting for exonerated items', async () => {
  const f = fixture();
  const taxed = await f.service.createDraft(f.input, f.branch, ids.user);
  const exempt = await f.service.createDraft({ ...f.input, taxType: 'EXONERADO' }, f.branch, ids.user);
  assert.equal((await f.service.issue(taxed.id, f.branch, ids.user)).number, 11);
  assert.equal((await f.service.issue(exempt.id, f.branch, ids.user)).number, 12);
});

test('a timeout preserves an unknown result and prohibits automatic reissue', async () => {
  const f = fixture(); const doc = await f.service.createDraft(f.input, f.branch, ids.user);
  f.provider.submit = async () => { f.calls.submit++; throw new Error('timeout'); };
  assert.equal((await f.service.issue(doc.id, f.branch, ids.user)).status, 'UNKNOWN');
  await assert.rejects(f.service.issue(doc.id, f.branch, ids.user), /procesado/);
  assert.equal(f.calls.submit, 1);
});

test('issuer mismatch, credit terms and cancelled source sales cannot reach the provider', async () => {
  for (const kind of ['issuer', 'credit', 'cancelled']) {
    const f = fixture(); if (kind === 'credit') f.sale.isCredit = true;
    const doc = await f.service.createDraft(f.input, f.branch, ids.user);
    if (kind === 'cancelled') f.sale.isCancelled = true;
    if (kind === 'issuer') { const original = f.provider.getStatus; f.provider.getStatus = async () => ({ ...await original(), issuerRuc: '20999999999' }); }
    await assert.rejects(f.service.issue(doc.id, f.branch, ids.user));
    assert.equal(f.calls.submit, 0); assert.equal(f.calls.reserve, 0);
  }
});

test('boleta reserves a summary number and polling updates its result without submitting it again', async () => {
  const f = fixture(); f.client.documentNumber = '12345678';
  f.provider.submit = async () => { f.calls.submit++; return { status: 'PENDING', ticket: 'ticket-test', sunatDescription: 'En proceso' }; };
  const draft = await f.service.createDraft({ ...f.input, documentType: 'BOLETA' }, f.branch, ids.user);
  const pending = await f.service.issue(draft.id, f.branch, ids.user);
  assert.equal(pending.status, 'PENDING'); assert.equal(pending.summaryNumber, 11);
  assert.ok(pending.summaryDate);
  assert.equal((await f.service.checkStatus(draft.id, ids.branch)).status, 'ACCEPTED');
  assert.equal(f.calls.submit, 1); assert.equal(f.calls.poll, 1);
});

test('sale cancellation, linked cash deletion and credit deletion stop before side effects when billed', async () => {
  const bills = { hasSubmittedSale: async () => true };
  const fail = () => { throw new Error('Side effect reached'); };
  const sale = { id: ids.sale, isCancelled: false, items: [] };
  const cancel = new CancelSaleUseCase({ findById: async () => sale }, { upsert: fail }, {}, {}, {}, {}, {}, bills);
  await assert.rejects(cancel.execute(ids.sale, 'Prueba', ids.user), /comprobante/);
  const deleteCash = new DeleteEntryUseCase({ findById: async () => ({ status: 'OPEN', entries: [{ id: 'entry', referenceType: 'Sale', referenceId: ids.sale }] }), updateEntry: fail }, bills);
  await assert.rejects(deleteCash.execute('register', 'entry', { reason: 'Prueba' }, ids.user), /comprobante/);
  const deleteCredit = new DeleteCreditUseCase({ findById: async () => ({ saleIds: [ids.sale] }), delete: fail }, {}, {}, {}, {}, {}, bills);
  await assert.rejects(deleteCredit.execute('credit', ids.user), /comprobante/);
});

test('sales preserve the voucher type once a fiscal document is associated', async () => {
  const { UpdateVoucherUseCase } = require('../dist/application/use-cases/sale/update-voucher.use-case');
  let writes = 0;
  const sale = { id: ids.sale, voucherType: 'BOLETA', isCancelled: false, items: [] };
  const repository = { findById: async () => sale, update: async () => { writes++; return sale; } };
  const useCase = new UpdateVoucherUseCase(repository, { hasActiveSale: async () => true });
  await assert.rejects(useCase.execute(ids.sale, 'FACTURA'), /comprobante asociado/);
  await assert.rejects(useCase.execute(ids.sale, 'NONE'), /comprobante asociado/);
  assert.equal(await useCase.execute(ids.sale, 'BOLETA'), sale);
  assert.equal(writes, 0);
  const unbilled = new UpdateVoucherUseCase(repository, { hasActiveSale: async () => false });
  await unbilled.execute(ids.sale, 'FACTURA');
  assert.equal(writes, 1);
});

test('fiscal slot includes tax type, while numbering has no branch or tax-group key', () => {
  const slot = BillingDocumentSchema.indexes().find(([, options]) => options.unique);
  assert.deepEqual(slot[0], { branch: 1, sale: 1, company: 1, taxType: 1 });
  assert.deepEqual(slot[1].partialFilterExpression, { activeSlot: true });
  assert.deepEqual(BillingCounterSchema.indexes()[0][0], { issuerRuc: 1, series: 1, environment: 1 });
});

test('sale persistence reads the immutable product description and tax snapshot', () => {
  const repository = new MongoSaleRepository({});
  const sale = repository.toEntity({ _id: ids.sale, branch: ids.branch, total: 118, date: new Date(), items: [{ product: { _id: ids.gravado, name: 'Nombre nuevo' }, productName: 'Nombre original', company: ids.company, quantity: 1, unitPrice: 118, subtotal: 118, unit: 'KG', taxType: 'GRAVADO', taxRate: .18 }] });
  assert.equal(sale.items[0].productName, 'Nombre original'); assert.equal(sale.items[0].taxType, 'GRAVADO');
});

let app; let http; let httpFixture;
before(async () => {
  httpFixture = fixture();
  class TestAuth { canActivate(context) { const req = context.switchToHttp().getRequest(); req.user = { id: ids.user, role: req.headers['x-test-role'] || 'ADMIN' }; return true; } }
  Injectable()(TestAuth);
  class TestModule {}
  Module({ controllers: [BillingController], providers: [{ provide: BillingService, useValue: httpFixture.service }] })(TestModule);
  app = await NestFactory.create(TestModule, { logger: false });
  app.useGlobalPipes(validationPipe);
  app.useGlobalGuards(new TestAuth(), new BranchAccessGuard(new Reflector(), { findById: async id => id === ids.branch ? httpFixture.branch : null }, { findById: async () => ({ isActive: true, branchAssignments: [] }) }), new RolesGuard(new Reflector()));
  app.useGlobalFilters(new HttpExceptionFilter()); app.useGlobalInterceptors(new ResponseTransformInterceptor());
  await app.listen(0, '127.0.0.1');
  http = axios.create({ baseURL: await app.getUrl(), proxy: false, validateStatus: () => true });
});
after(async () => { if (app) await app.close(); });

test('HTTP enforces branch selection, branch assignments, roles and explicit boolean confirmation', async () => {
  assert.equal((await http.get('/billing/documents')).status, 400);
  assert.equal((await http.get('/billing/documents', { headers: { 'x-branch-id': ids.branch, 'x-test-role': 'ALMACENERO' } })).status, 403);
  const headers = { 'x-branch-id': ids.branch };
  const created = await http.post('/billing/documents', httpFixture.input, { headers });
  assert.equal(created.status, 201);
  const id = created.data.data.id;
  const simulated = await http.post(`/billing/documents/${id}/simulate`, {}, { headers });
  assert.equal(simulated.status, 201); assert.equal(simulated.data.data.status, 'SIMULATED');
  assert.equal(simulated.data.data.document.status, 'DRAFT'); assert.equal(httpFixture.calls.reserve, 0);
  assert.equal((await http.post(`/billing/documents/${id}/issue`, { confirm: 'true' }, { headers })).status, 400);
  assert.equal((await http.post(`/billing/documents/${id}/issue`, { confirm: false }, { headers })).status, 400);
  assert.equal((await http.post(`/billing/documents/${id}/issue`, { confirm: true, number: 99 }, { headers })).status, 400);
  const issued = await http.post(`/billing/documents/${id}/issue`, { confirm: true }, { headers });
  assert.equal(issued.status, 201); assert.equal(issued.data.data.status, 'ACCEPTED');
});

test('HTTP returns actual binary files, rejects invalid ids and caps listing sizes', async () => {
  const headers = { 'x-branch-id': ids.branch };
  const created = await http.post('/billing/documents', { ...httpFixture.input, taxType: 'EXONERADO' }, { headers });
  const response = await http.get(`/billing/documents/${created.data.data.id}/files/pdf`, { headers, responseType: 'arraybuffer' });
  assert.equal(response.status, 200); assert.match(response.headers['content-type'], /application\/pdf/);
  assert.equal(Buffer.from(response.data).toString(), '%PDF-billing-test');
  assert.equal((await http.get('/billing/documents/not-an-id', { headers })).status, 400);
  assert.equal((await http.get('/billing/documents?limit=99999', { headers })).status, 400);
});

test('real HTTP provider adapter preserves units/tax groups and treats CDR rejection as rejection', async () => {
  const f = fixture(); let captured; let mode = 'ACCEPTED'; let calls = 0;
  const server = createServer(async (req, res) => {
    if (req.headers.authorization !== 'Bearer billing-test-key') { res.writeHead(401); res.end('{}'); return; }
    res.setHeader('Content-Type', 'application/json');
    if (req.url.endsWith('/capabilities')) { res.end(JSON.stringify({ apiVersion: 'agromax-1', ready: true, environment: 'beta', issuer: { ruc: f.company.ruc, razonSocial: f.company.name }, supportedDocumentTypes: ['FACTURA', 'BOLETA'] })); return; }
    let body = ''; for await (const chunk of req) body += chunk; captured = JSON.parse(body); calls++;
    res.end(JSON.stringify({ invoiceNumber: `${captured.serie}-${captured.numero}`, emisorRuc: f.company.ruc, environment: 'beta', status: mode, success: true, sunatResponse: { code: mode === 'ACCEPTED' ? '0' : '2335', description: 'Simulado' }, xmlBase64: Buffer.from('<Invoice/>').toString('base64'), pdfBase64: Buffer.from('%PDF-test').toString('base64'), cdrBase64: Buffer.from('PK-cdr-test').toString('base64') }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const config = new ConfigService({ GREENTER_SERVICE_URL: `http://127.0.0.1:${server.address().port}`, GREENTER_API_KEY: 'billing-test-key', GREENTER_ISSUER_RUC: f.company.ruc, GREENTER_ENVIRONMENT: 'beta', GREENTER_ENABLED: 'true', GREENTER_SERIE_FACTURA: 'F001', GREENTER_SERIE_BOLETA: 'B001', GREENTER_FACTURA_NEXT_NUMBER: '11', GREENTER_BOLETA_NEXT_NUMBER: '11', GREENTER_SUMMARY_NEXT_NUMBER: '11' });
    const provider = new GreenterBillingProvider(config);
    assert.equal((await provider.getStatus()).ready, true);
    const document = { ...await f.service.preview(f.input, f.branch), series: 'F001', number: 11, environment: 'beta', submittedAt: new Date() };
    assert.equal((await provider.submit(document)).status, 'ACCEPTED');
    assert.equal(captured.items[0].unidad, 'KGM'); assert.equal(captured.items[0].tipAfeIgv, '10'); assert.equal(captured.items[0].porcentajeIgv, 18);
    const exempt = { ...await f.service.preview({ ...f.input, taxType: 'EXONERADO' }, f.branch), series: 'F001', number: 12, environment: 'beta', submittedAt: new Date() };
    mode = 'REJECTED'; assert.equal((await provider.submit(exempt)).status, 'REJECTED');
    assert.equal(captured.items[0].tipAfeIgv, '20'); assert.equal(captured.items[0].igv, 0); assert.equal(captured.mtoOperGravadas, 0); assert.equal(captured.mtoOperExoneradas, 50);
    assert.equal(calls, 2);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('production stays disabled without explicit enablement and no secret is returned in status', async () => {
  const provider = new GreenterBillingProvider(new ConfigService({ GREENTER_SERVICE_URL: 'https://example.invalid', GREENTER_API_KEY: 'do-not-expose', GREENTER_ISSUER_RUC: '20100070970', GREENTER_ENVIRONMENT: 'production', GREENTER_ENABLED: 'true', GREENTER_SERIE_FACTURA: 'F001', GREENTER_SERIE_BOLETA: 'B001', GREENTER_FACTURA_NEXT_NUMBER: '1', GREENTER_BOLETA_NEXT_NUMBER: '1', GREENTER_SUMMARY_NEXT_NUMBER: '1' }));
  const status = await provider.getStatus(); assert.equal(status.ready, false); assert.doesNotMatch(JSON.stringify(status), /do-not-expose/);
});

test('an unconfirmed provider result preserves transport diagnostics and document evidence without inventing a CDR', async () => {
  const f = fixture(); const provider = new GreenterBillingProvider(new ConfigService());
  const document = { ...await f.service.preview(f.input, f.branch), series: 'FAG1', number: 1, environment: 'production' };
  const response = { invoiceNumber: 'FAG1-00000001', emisorRuc: f.company.ruc, environment: 'production', status: 'UNKNOWN', description: 'Error HTTP: Unauthorized. No se recibió constancia.', pdfBase64: Buffer.from('%PDF-test').toString('base64'), xmlBase64: Buffer.from('<Invoice/>').toString('base64') };
  const result = provider.parseResult(response, document);
  assert.equal(result.status, 'UNKNOWN'); assert.match(result.sunatDescription, /Unauthorized/);
  assert.equal(result.pdfBase64, response.pdfBase64); assert.equal(result.xmlBase64, response.xmlBase64);
  assert.equal(result.cdrBase64, undefined); assert.equal(result.sunatCode, undefined);
  assert.equal(provider.parseResult({ ...response, invoiceNumber: 'OTHER-1' }, document).pdfBase64, undefined, 'Evidence from another identity must be rejected');
  assert.equal(provider.parseResult({ ...response, pdfBase64: Buffer.from('invalid').toString('base64') }, document).pdfBase64, undefined);
});


test('three branches select independent series; only summary mode requires coordinated RC numbering', async () => {
  const f = fixture(); let gets = 0; let boletaSubmissionMode;
  const server = createServer((req, res) => {
    assert.equal(req.method, 'GET'); gets++;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ apiVersion: 'agromax-1', ready: true, environment: 'production', boletaSubmissionMode, issuer: { ruc: f.company.ruc, establishmentCode: '0000' }, supportedDocumentTypes: ['FACTURA', 'BOLETA'] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const config = new ConfigService({ GREENTER_SERVICE_URL: `http://127.0.0.1:${server.address().port}`, GREENTER_API_KEY: 'test-only', GREENTER_ISSUER_RUC: f.company.ruc, GREENTER_ENVIRONMENT: 'production', GREENTER_ENABLED: 'true', GREENTER_ALLOW_PRODUCTION: 'true', GREENTER_BRANCH_NUMBERING: 'true', GREENTER_FACTURA_NEXT_NUMBER: '1', GREENTER_BOLETA_NEXT_NUMBER: '1' });
    const provider = new GreenterBillingProvider(config);
    assert.equal((await provider.getStatus()).ready, false); assert.equal(gets, 0);
    for (const code of ['1', '2', '3']) {
      const status = await provider.getStatus(code, '0000');
      assert.deepEqual(status.series, { FACTURA: `FAG${code}`, BOLETA: `BAG${code}` });
      assert.deepEqual(status.supportedDocumentTypes, ['FACTURA']);
    }
    const inherited = await provider.getStatus('1');
    assert.equal(inherited.issuerEstablishmentCode, '0000'); assert.equal(inherited.ready, true, 'The configured issuer default can be used without duplicating it on every branch');
    config.set('GREENTER_SUMMARY_NEXT_NUMBER', '1');
    assert.deepEqual((await provider.getStatus('3', '0000')).supportedDocumentTypes, ['FACTURA', 'BOLETA']);
    config.set('GREENTER_EXTERNAL_BILLING_ACTIVE', 'true');
    assert.deepEqual((await provider.getStatus('3', '0000')).supportedDocumentTypes, ['FACTURA'], 'Knowing the next number is insufficient while another system emits');
    config.set('GREENTER_SUMMARY_LAST_NUMBER', '20');
    assert.deepEqual((await provider.getStatus('3', '0000')).supportedDocumentTypes, ['FACTURA']);
    config.set('GREENTER_SUMMARY_RANGE_CONFIRMED', 'true');
    assert.deepEqual((await provider.getStatus('3', '0000')).supportedDocumentTypes, ['FACTURA', 'BOLETA']);
    assert.equal(provider.getSummaryNumberLimit(), 20);
    config.set('GREENTER_SUMMARY_LAST_NUMBER', '0');
    assert.deepEqual((await provider.getStatus('3', '0000')).supportedDocumentTypes, ['FACTURA']);
    boletaSubmissionMode = 'individual';
    const individual = await provider.getStatus('1', '0000');
    assert.equal(individual.boletaSubmissionMode, 'individual');
    assert.deepEqual(individual.supportedDocumentTypes, ['FACTURA', 'BOLETA'], 'Individual boletas must not depend on RC numbers, even if external billing is enabled');
    let code;
    f.provider.getStatus = async value => { code = value; return { configured: true, ready: true, issuerRuc: f.company.ruc, environment: 'beta', series: { FACTURA: `FAG${value}`, BOLETA: `BAG${value}` }, supportedDocumentTypes: ['FACTURA', 'BOLETA'], message: 'Offline' }; };
    f.branch.billingSeriesCode = '2';
    const draft = await f.service.createDraft(f.input, f.branch, ids.user);
    const result = await f.service.issue(draft.id, f.branch, ids.user);
    assert.equal(code, '2'); assert.equal(result.series, 'FAG2');
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('branch billing codes cannot be reused or changed through administration', async () => {
  const { ManageBranchesUseCase } = require('../dist/application/use-cases/branch/manage-branches.use-case');
  const branches = [{ id: ids.branch, code: 'CENTRAL', companyIds: [ids.company], billingSeriesCode: '1' }];
  let writes = 0;
  const useCase = new ManageBranchesUseCase({ findById: async () => clone(branches[0]), findByCode: async () => null, findAll: async () => clone(branches), create: async data => { writes++; return data; }, update: async (id, data) => { writes++; return data; } }, {});
  await assert.rejects(useCase.create({ code: 'NORTE', name: 'Norte', companyIds: [ids.company], billingSeriesCode: '1' }), /otra sucursal/);
  await assert.rejects(useCase.update(ids.branch, { billingSeriesCode: '2' }), /se conserva/);
  await assert.rejects(useCase.update(ids.branch, { billingSeriesCode: null }), /se conserva/);
  assert.equal(writes, 0);
  await useCase.create({ code: 'NORTE', name: 'Norte', companyIds: [ids.company], billingSeriesCode: '2' });
  assert.equal(writes, 1);
});


test('boleta issuance passes the reserved summary range limit to the atomic counter', async () => {
  const f = fixture();
  f.provider.getSummaryNumberLimit = () => 20;
  const reserve = f.documents.reserveNumber;
  const allocations = [];
  f.documents.reserveNumber = async (...args) => { allocations.push(args); return reserve(...args); };
  const draft = await f.service.createDraft({ ...f.input, documentType: 'BOLETA' }, f.branch, ids.user);
  await f.service.issue(draft.id, f.branch, ids.user);
  assert.equal(allocations.length, 2);
  assert.match(allocations[1][1], /^RC-/);
  assert.equal(allocations[1][4], 20);
});

test('individual boletas retain BAG1 and only allocate their own number for simple, DNI and RUC receivers', async () => {
  for (const receiver of [
    { documentType: 'UNIDENTIFIED', name: 'CONSUMIDOR FINAL' },
    { documentType: 'DNI', documentNumber: '12345678', name: 'CLIENTE DNI' },
    { documentType: 'RUC', documentNumber: '10000000009', name: 'CLIENTE RUC' },
  ]) {
    const f = fixture(); const status = await f.provider.getStatus();
    f.provider.getStatus = async () => ({ ...status, boletaSubmissionMode: 'individual', series: { FACTURA: 'FAG1', BOLETA: 'BAG1' } });
    f.provider.getNumberingStart = type => { assert.notEqual(type, 'SUMMARY'); return 1; };
    const draft = await f.service.createDraft({ ...f.input, documentType: 'BOLETA', receiver }, f.branch, ids.user);
    const result = await f.service.issue(draft.id, f.branch, ids.user);
    assert.equal(result.status, 'ACCEPTED'); assert.equal(result.series, 'BAG1'); assert.equal(result.number, 1);
    assert.equal(result.boletaSubmissionMode, 'individual'); assert.equal(f.calls.reserve, 1);
    assert.equal(result.summaryDate, undefined); assert.equal(result.summaryNumber, undefined);
    const payload = new GreenterBillingProvider(new ConfigService()).buildPayload(result);
    assert.equal(payload.boletaSubmissionMode, 'individual'); assert.equal(payload.resumenFecha, undefined); assert.equal(payload.resumenCorrelativo, undefined);
    await assert.rejects(f.service.issue(draft.id, f.branch, ids.user), /procesado/);
    assert.equal(f.calls.submit, 1);
  }
});

test('one-sol simple boleta sold by Par emits as PR without changing quantity or creating another sale', async () => {
  const f = fixture();
  f.sale.items = [{ ...f.sale.items[0], unit: 'Par', quantity: 1, unitPrice: 1, subtotal: 1 }];
  f.sale.total = 1;
  const status = await f.provider.getStatus();
  f.provider.getStatus = async () => ({ ...status, boletaSubmissionMode: 'individual', series: { FACTURA: 'FAG1', BOLETA: 'BAG1' } });
  const adapter = new GreenterBillingProvider(new ConfigService());
  let payload;
  f.provider.submit = async document => { f.calls.submit++; payload = adapter.buildPayload(document); return { status: 'ACCEPTED', sunatCode: '0', sunatDescription: 'Offline fixture' }; };
  const draft = await f.service.createDraft({ ...f.input, documentType: 'BOLETA', receiver: { documentType: 'UNIDENTIFIED', name: 'CONSUMIDOR FINAL' } }, f.branch, ids.user);
  assert.equal(draft.items[0].unit, 'Par', 'The historical sale unit must be retained');
  const issued = await f.service.issue(draft.id, f.branch, ids.user, 0);
  assert.equal(issued.status, 'ACCEPTED'); assert.equal(payload.items[0].unidad, 'PR');
  assert.equal(payload.items[0].cantidad, 1); assert.equal(payload.mtoImpVenta, 1);
  assert.equal(f.calls.reserve, 1); assert.equal(f.calls.submit, 1);
  assert.equal(f.sale.items[0].quantity, 1); assert.equal(f.sale.total, 1);
});


test('receiver cases cover simple/DNI/RUC10 boletas and RUC10/RUC20 invoices without changing the sale client', async () => {
  const parties = [
    ['BOLETA', { documentType: 'UNIDENTIFIED', name: '' }],
    ['BOLETA', { documentType: 'DNI', documentNumber: '12345678', name: 'CLIENTE DNI' }],
    ['BOLETA', { documentType: 'RUC', documentNumber: '10000000009', name: 'CLIENTE RUC10' }],
    ['FACTURA', { documentType: 'RUC', documentNumber: '10000000009', name: 'CLIENTE RUC10' }],
    ['FACTURA', { documentType: 'RUC', documentNumber: '20100070970', name: 'CLIENTE RUC20' }],
  ];
  for (const [documentType, receiver] of parties) {
    const f = fixture(); const before = clone(f.client);
    const doc = await f.service.createDraft({ ...f.input, documentType, receiver }, f.branch, ids.user);
    assert.equal(doc.receiver.documentType, receiver.documentType);
    const edited = await f.service.updateReceiver(doc.id, ids.branch, doc.receiver, ids.user, 0);
    assert.equal(edited.receiverRevision, 1);
    await assert.rejects(f.service.updateReceiver(doc.id, ids.branch, doc.receiver, ids.user, 0), /cambió/);
    await assert.rejects(f.service.issue(doc.id, f.branch, ids.user, 0), /receptor cambió/);
    assert.equal(f.calls.reserve, 0);
    assert.equal((await f.service.issue(doc.id, f.branch, ids.user, 1)).status, 'ACCEPTED');
    await assert.rejects(f.service.updateReceiver(doc.id, ids.branch, doc.receiver, ids.user, 1), /borrador/);
    assert.deepEqual(f.client, before);
  }
});

test('simple boletas respect the S/700 boundary; facturas reject DNI and invalid RUC prefixes', () => {
  const { normalizeBillingReceiver } = require('../dist/application/services/billing-receiver');
  const simple = { documentType: 'UNIDENTIFIED', name: '' };
  assert.equal(normalizeBillingReceiver('BOLETA', 700, simple).name, 'CONSUMIDOR FINAL');
  assert.throws(() => normalizeBillingReceiver('BOLETA', 700.01, simple), /S\/700/);
  assert.throws(() => normalizeBillingReceiver('FACTURA', 1, simple), /RUC/);
  assert.throws(() => normalizeBillingReceiver('FACTURA', 1, { documentType: 'DNI', documentNumber: '12345678', name: 'Cliente' }), /RUC/);
  assert.throws(() => normalizeBillingReceiver('FACTURA', 1, { documentType: 'RUC', documentNumber: '30100070970', name: 'Cliente' }), /10 o 20/);
  assert.throws(() => normalizeBillingReceiver('BOLETA', 1, { ...simple, documentNumber: '12345678' }), /oculto/);
});

test('receipt adapter maps an unidentified buyer to dash markers instead of inventing a DNI', async () => {
  const f = fixture(); const document = await f.service.preview({ ...f.input, documentType: 'BOLETA', receiver: { documentType: 'UNIDENTIFIED', name: '' } }, f.branch);
  const provider = new GreenterBillingProvider(new ConfigService({}));
  const payload = provider.buildPayload(document);
  assert.equal(payload.cliente.tipoDoc, '-'); assert.equal(payload.cliente.numDoc, '-');
  assert.equal(payload.cliente.rznSocial, 'CONSUMIDOR FINAL');
});

test('HTTP rejects receiver edits after issuance and requires a complete nested receiver with a revision', async () => {
  const headers = { 'x-branch-id': ids.branch };
  const created = await http.post('/billing/documents', { ...httpFixture.input, taxType: 'INAFECTO' }, { headers });
  const id = created.data.data.id;
  assert.equal((await http.post(`/billing/documents/${id}/receiver`, { expectedRevision: 0 }, { headers })).status, 400);
  assert.equal((await http.post(`/billing/documents/${id}/receiver`, { expectedRevision: 0, receiver: { documentType: 'DNI', documentNumber: '12345678', name: 'Cliente' } }, { headers })).status, 400, 'Factura cannot receive DNI');
  const receiver = { documentType: 'RUC', documentNumber: '10000000009', name: 'CLIENTE RUC10' };
  const updated = await http.post(`/billing/documents/${id}/receiver`, { expectedRevision: 0, receiver }, { headers });
  assert.equal(updated.status, 201); assert.equal(updated.data.data.receiverRevision, 1);
  assert.equal((await http.post(`/billing/documents/${id}/issue`, { confirm: true, receiverRevision: 0 }, { headers })).status, 409);
});


test('restricted products block their complete fiscal group without filtering sale lines', async () => {
  const f = fixture();
  f.products.get(ids.gravado).billingEnabled = false;
  const groups = await f.service.saleGroups(ids.sale, f.branch);
  const blocked = groups.find(group => group.taxType === 'GRAVADO');
  assert.equal(blocked.billingEnabled, false); assert.equal(blocked.total, 118);
  assert.deepEqual(blocked.blockedProducts, ['Producto gravado']);
  assert.equal(groups.find(group => group.taxType === 'EXONERADO').billingEnabled, true);
  for (const documentType of ['BOLETA', 'FACTURA']) {
    await assert.rejects(f.service.preview({ ...f.input, documentType }, f.branch), /no está habilitado/);
    await assert.rejects(f.service.createDraft({ ...f.input, documentType }, f.branch, ids.user), /no está habilitado/);
  }
  assert.equal(f.calls.create, 0); assert.equal(f.calls.submit, 0); assert.equal(f.calls.reserve, 0);
  assert.equal(f.sale.items.length, 3);
});

test('disabling a product invalidates old drafts before claiming or reserving a fiscal number', async () => {
  const f = fixture();
  const draft = await f.service.createDraft(f.input, f.branch, ids.user);
  f.products.get(ids.gravado).billingEnabled = false;
  await assert.rejects(f.service.createDraft(f.input, f.branch, ids.user), /no está habilitado/);
  await assert.rejects(f.service.simulate(draft.id, ids.branch), /no está habilitado/);
  await assert.rejects(f.service.issue(draft.id, f.branch, ids.user, 0), /no está habilitado/);
  assert.equal(f.records.get(draft.id).status, 'DRAFT');
  assert.equal(f.calls.submit, 0); assert.equal(f.calls.reserve, 0);
  f.products.get(ids.gravado).billingEnabled = true;
  const issued = await f.service.issue(draft.id, f.branch, ids.user, 0);
  assert.equal(issued.status, 'ACCEPTED');
  f.products.get(ids.gravado).billingEnabled = false;
  assert.equal((await f.service.findById(draft.id, ids.branch)).status, 'ACCEPTED');
  f.records.get(draft.id).cancelledByCreditNoteId = ids.foreign;
  f.records.get(draft.id).cancelledAt = new Date();
  await assert.rejects(f.service.preview({ ...f.input, replacesDocumentId: draft.id }, f.branch), /no está habilitado/);
});

test('changing a sales note to a fiscal voucher checks current product eligibility', async () => {
  const { UpdateVoucherUseCase } = require('../dist/application/use-cases/sale/update-voucher.use-case');
  let writes = 0;
  const sale = { id: ids.sale, voucherType: 'NONE', items: [{ productId: ids.gravado }] };
  const repository = { findById: async () => sale, update: async (_, patch) => { writes++; Object.assign(sale, patch); return sale; } };
  const product = { name: 'Restringido', billingEnabled: false };
  const useCase = new UpdateVoucherUseCase(repository, { hasActiveSale: async () => false }, { findById: async () => product });
  for (const type of ['BOLETA', 'FACTURA']) await assert.rejects(useCase.execute(ids.sale, type), /no está habilitado/);
  assert.equal(writes, 0);
  product.billingEnabled = true;
  await useCase.execute(ids.sale, 'BOLETA');
  product.billingEnabled = false;
  await useCase.execute(ids.sale, 'NONE');
  assert.equal(sale.voucherType, 'NONE'); assert.equal(writes, 2);
});
