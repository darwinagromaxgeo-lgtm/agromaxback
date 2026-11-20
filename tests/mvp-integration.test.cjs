const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, openSync, closeSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { randomBytes } = require('node:crypto');
const mongoose = require('mongoose');
const { seed, validateEnvironment } = require('../scripts/seed-mvp.cjs');

const backend = path.resolve(__dirname, '..');
const service = path.resolve(backend, '../facturacion-service');
const objectId = number => String(number).padStart(24, '0');
async function port() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const number = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return number;
}
async function waitFor(url, child) {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('Local process exited before becoming ready');
    try { const response = await fetch(url, { signal: AbortSignal.timeout(800) }); if (response.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('Local process did not become ready');
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  const ended = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  await ended; clearTimeout(timer);
}

test('MVP seed refuses existing operational database names and remote hosts', () => {
  const env = { MVP_MODE: 'true', MVP_ADMIN_PASSWORD: 'test-only-password' };
  for (const uri of ['mongodb://127.0.0.1:27017/fertilizantes', 'mongodb://remote.example/agromax_mvp', 'mongodb+srv://remote.example/agromax_mvp']) {
    assert.throws(() => validateEnvironment({ ...env, MONGODB_URI: uri }));
  }
  assert.throws(() => validateEnvironment({ ...env, MVP_MODE: 'false', MONGODB_URI: 'mongodb://127.0.0.1/agromax_mvp' }));
});

test('real Nest + MongoDB + independent PHP service simulate separate invoices and boletas without fiscal side effects', { timeout: 90_000 }, async () => {
  assert.ok(process.env.MONGOD_BIN && existsSync(process.env.MONGOD_BIN), 'Set MONGOD_BIN to a local mongod binary');
  assert.ok(process.env.PHP_BIN && existsSync(process.env.PHP_BIN), 'Set PHP_BIN to PHP 8.2+ with the Composer extensions');
  assert.ok(existsSync(path.join(service, 'vendor/autoload.php')), 'Install the independent service dependencies first');
  const temporary = mkdtempSync(path.join(tmpdir(), 'agromax-mvp-integration-'));
  mkdirSync(path.join(temporary, 'db'));
  const processes = []; const descriptors = [];
  const launch = (name, command, args, options = {}) => {
    const descriptor = openSync(path.join(temporary, `${name}.log`), 'a', 0o600); descriptors.push(descriptor);
    const child = spawn(command, args, { stdio: ['ignore', descriptor, descriptor], ...options });
    processes.push(child); return child;
  };
  let database;
  try {
    const [mongoPort, phpPort, backendPort] = await Promise.all([port(), port(), port()]);
    const password = randomBytes(16).toString('hex'); const sharedKey = randomBytes(24).toString('hex');
    const uri = `mongodb://127.0.0.1:${mongoPort}/agromax_mvp_test`;
    const mongo = launch('mongo', process.env.MONGOD_BIN, ['--dbpath', path.join(temporary, 'db'), '--bind_ip', '127.0.0.1', '--port', String(mongoPort)]);
    for (let attempt = 0; attempt < 100; attempt++) {
      try { database = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 150 }).asPromise(); break; }
      catch { if (mongo.exitCode !== null) throw new Error('Temporary MongoDB exited'); await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert.ok(database, 'Temporary MongoDB must start');
    await seed({ MVP_MODE: 'true', MONGODB_URI: uri, MVP_ADMIN_PASSWORD: password });
    const php = launch('php', process.env.PHP_BIN, ['-S', `127.0.0.1:${phpPort}`, '-t', 'public', 'public/index.php'], { cwd: service, env: { ...process.env, AGROMAX_MODE: 'simulation', AGROMAX_BOLETA_SUBMISSION_MODE: 'individual', AGROMAX_API_KEY: sharedKey, COMPANY_RUC: '20600000001', SUNAT_RUC: '', SUNAT_USUARIO: '', SUNAT_CLAVE: '', CERTIFICATE_BASE64: '', CERTIFICATE_PASSWORD: '' } });
    await waitFor(`http://127.0.0.1:${phpPort}/api/health`, php);
    const appProcess = launch('backend', process.execPath, ['dist/main.js'], { cwd: backend, env: { ...process.env, AGROMAX_ENV_FILE: path.join(temporary, 'absent.env'), MONGODB_URI: uri, PORT: String(backendPort), JWT_SECRET: randomBytes(32).toString('hex'), DECOLECTA_API_KEY: '', GREENTER_ENABLED: 'false', GREENTER_SIMULATION_ENABLED: 'true', GREENTER_ALLOW_PRODUCTION: 'false', GREENTER_ENVIRONMENT: 'beta', GREENTER_SERVICE_URL: `http://127.0.0.1:${phpPort}`, GREENTER_API_KEY: sharedKey, GREENTER_ISSUER_RUC: '20600000001' } });
    await waitFor(`http://127.0.0.1:${backendPort}/api/health`, appProcess);
    let authorization;
    const request = async (method, route, body, expected = method === 'POST' ? 201 : 200, branch = objectId(8002)) => {
      const response = await fetch(`http://127.0.0.1:${backendPort}/api${route}`, { method, headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}), ...(branch ? { 'x-branch-id': branch } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const payload = await response.json(); assert.equal(response.status, expected, `${route}: ${JSON.stringify(payload).slice(0, 250)}`); return payload.data;
    };
    authorization = `Bearer ${(await request('POST', '/auth/login', { username: 'mvpadmin', password })).accessToken}`;
    const status = await request('GET', '/billing/status');
    assert.equal(status.simulationReady, true); assert.equal(status.ready, false); assert.equal(status.environment, 'simulation');
    assert.equal(status.boletaSubmissionMode, 'individual');
    const sales = [];
    for (const [client, type] of [[8020, 'FACTURA'], [8021, 'BOLETA']]) {
      const sale = await request('POST', '/sales', { clientId: objectId(client), voucherType: type, items: [[8010, 118], [8011, 50], [8012, 30]].map(([product, unitPrice]) => ({ productId: objectId(product), companyId: objectId(8001), quantity: 1, priceTier: objectId(8005), unitPrice })), payments: [{ paymentMethodId: objectId(8006), amount: 198 }] });
      sales.push([sale, type]);
      assert.equal(sale.branchId, objectId(8002), 'The sale response must retain its branch');
    }
    const db = database.db;
    const snapshot = async () => ({ sales: await db.collection('sales').countDocuments(), stocks: await db.collection('stocks').find({}).sort({ _id: 1 }).toArray(), cash: await db.collection('cash_registers').find({}).toArray(), movements: await db.collection('stock_movements').countDocuments(), counters: await db.collection('billing_counters').countDocuments() });
    const before = await snapshot();
    assert.equal(before.sales, 2); assert.ok(before.stocks.every(stock => stock.quantity === 98)); assert.equal(before.cash.reduce((sum, register) => sum + register.entries.length, 0), 2);
    const listed = await request('GET', '/sales');
    assert.equal(listed.data.length, 2);
    assert.ok(listed.data.every(sale => sale.branchId === objectId(8002)), 'Populated sales must retain the stored branch');
    for (const [sale, type] of sales) {
      const groups = await request('GET', `/billing/sales/${sale.id}/groups`);
      assert.equal(groups.length, 3);
      for (const group of groups) {
        const input = { saleId: sale.id, companyId: objectId(8001), taxType: group.taxType, documentType: type };
        const [draft, repeated] = await Promise.all([request('POST', '/billing/documents', input), request('POST', '/billing/documents', input)]);
        assert.equal(draft.id, repeated.id, 'MongoDB unique index must prevent duplicate drafts');
        const result = await request('POST', `/billing/documents/${draft.id}/simulate`, {});
        assert.equal(result.status, 'SIMULATED'); assert.equal(result.service.verified, true, result.service.message);
        assert.equal(Buffer.from(result.service.pdfBase64, 'base64').subarray(0, 5).toString(), '%PDF-');
        const xml = Buffer.from(result.service.xmlBase64, 'base64').toString();
        assert.ok(xml.includes(type === 'FACTURA' ? 'FDEM-' : 'BDEM-'));
        assert.ok(xml.includes(`<cbc:TaxExemptionReasonCode>${{ GRAVADO: '10', EXONERADO: '20', INAFECTO: '30' }[group.taxType]}`));
        const saved = await request('GET', `/billing/documents/${draft.id}`);
        assert.equal(saved.status, 'DRAFT'); assert.equal(saved.number, undefined); assert.equal(saved.hasCdr, false);
        await request('POST', `/billing/documents/${draft.id}/issue`, { confirm: true }, 400);
      }
    }
    assert.equal(await db.collection('billing_documents').countDocuments(), 6);
    const batch = await request('GET', `/billing/documents?saleIds=${sales.map(([sale]) => sale.id).join(',')}&limit=100`);
    assert.equal(batch.data.length, 6);
    assert.ok(batch.data.every(document => sales.some(([sale]) => sale.id === document.saleId)));
    await request('GET', '/billing/documents?saleIds=bad-id', undefined, 400);
    await request('PATCH', `/sales/${sales[0][0].id}/voucher`, { voucherType: 'NONE' }, 400);
    for (const [sale] of sales) {
      const documents = await request('GET', `/billing/documents?saleId=${sale.id}`);
      assert.equal(documents.data.length, 3);
      assert.ok(documents.data.every(document => document.saleId === sale.id), 'POS recovery must only retrieve documents belonging to its saved sale');
    }
    assert.deepEqual(await snapshot(), before, 'Simulation must not alter sales, stock, cash, movements or fiscal counters');
    // The seed is repeatable and must not replenish stock consumed by the sales.
    await seed({ MVP_MODE: 'true', MONGODB_URI: uri, MVP_ADMIN_PASSWORD: password });
    assert.deepEqual(await snapshot(), before);
    // Exercise the requested S/1 scenario through Nest -> PHP -> XML/PDF.
    // These sales exist only in this disposable MongoDB, using dummy identity
    // and a simulation transport without SOAP credentials.
    for (const [client, documentType] of [[8020, 'FACTURA'], [8021, 'BOLETA']]) {
      const sale = await request('POST', '/sales', {
        clientId: objectId(client), voucherType: documentType,
        items: [{ productId: objectId(8010), companyId: objectId(8001), quantity: 1, priceTier: objectId(8005), unitPrice: 1 }],
        payments: [{ paymentMethodId: objectId(8006), amount: 1 }],
      });
      const draft = await request('POST', '/billing/documents', { saleId: sale.id, companyId: objectId(8001), taxType: 'GRAVADO', documentType });
      assert.equal(draft.total, 1); assert.equal(draft.taxableAmount, 0.85); assert.equal(draft.taxAmount, 0.15);
      const beforeSimulation = await snapshot();
      const simulation = await request('POST', `/billing/documents/${draft.id}/simulate`, {});
      assert.equal(simulation.service.verified, true); assert.equal(simulation.status, 'SIMULATED');
      const xml = Buffer.from(simulation.service.xmlBase64, 'base64');
      assert.ok(xml.toString().includes('<cbc:PayableAmount currencyID="PEN">1.00</cbc:PayableAmount>'));
      assert.deepEqual(await snapshot(), beforeSimulation, 'One-sol simulation must not consume stock, cash or fiscal numbers');
      if (process.env.AGROMAX_TEST_ARTIFACTS_DIR) {
        const folder = path.resolve(process.env.AGROMAX_TEST_ARTIFACTS_DIR);
        mkdirSync(folder, { recursive: true, mode: 0o700 });
        const filename = `${documentType.toLowerCase()}-S1-simulacion`;
        writeFileSync(path.join(folder, `${filename}.xml`), xml, { mode: 0o600 });
        writeFileSync(path.join(folder, `${filename}.pdf`), Buffer.from(simulation.service.pdfBase64, 'base64'), { mode: 0o600 });
      }
    }
    const clientSnapshot = await db.collection('clients').find({}).sort({ _id: 1 }).toArray();
    const receiverCases = [
      ['BOLETA', { documentType: 'UNIDENTIFIED', name: '' }],
      ['BOLETA', { documentType: 'DNI', documentNumber: '12345678', name: 'CLIENTE DNI' }],
      ['BOLETA', { documentType: 'RUC', documentNumber: '10000000009', name: 'CLIENTE RUC10' }],
      ['FACTURA', { documentType: 'RUC', documentNumber: '10000000009', name: 'CLIENTE RUC10' }],
      ['FACTURA', { documentType: 'RUC', documentNumber: '20100070970', name: 'CLIENTE RUC20' }],
    ];
    let lastReceiverDraft;
    for (const [documentType, receiver] of receiverCases) {
      const sale = await request('POST', '/sales', { clientId: receiver.documentType === 'UNIDENTIFIED' ? undefined : objectId(8020), voucherType: documentType,
        items: [{ productId: objectId(8010), companyId: objectId(8001), quantity: 1, priceTier: objectId(8005), unitPrice: 1 }], payments: [{ paymentMethodId: objectId(8006), amount: 1 }] });
      const draft = await request('POST', '/billing/documents', { saleId: sale.id, companyId: objectId(8001), taxType: 'GRAVADO', documentType, receiver });
      const stockAndCash = await snapshot();
      const updated = await request('POST', `/billing/documents/${draft.id}/receiver`, { receiver: { ...receiver, name: receiver.name + ' CORREGIDO' }, expectedRevision: 0 });
      assert.equal(updated.receiverRevision, 1);
      await request('POST', `/billing/documents/${draft.id}/receiver`, { receiver, expectedRevision: 0 }, 409);
      await request('POST', `/billing/documents/${draft.id}/issue`, { confirm: true, receiverRevision: 0 }, 409);
      const simulated = await request('POST', `/billing/documents/${draft.id}/simulate`, {});
      assert.equal(simulated.service.verified, true);
      const signedXml = Buffer.from(simulated.service.xmlBase64, 'base64').toString();
      assert.ok(signedXml.includes(`schemeID="${receiver.documentType === 'RUC' ? '6' : receiver.documentType === 'DNI' ? '1' : '-'}"`));
      await request('POST', `/billing/documents/${draft.id}/issue`, { confirm: true, receiverRevision: 1 }, 400);
      assert.deepEqual(await snapshot(), stockAndCash, 'Reviewing/changing the receiver does not alter stock, cash or fiscal numbering');
      lastReceiverDraft = updated;
    }
    assert.deepEqual(await db.collection('clients').find({}).sort({ _id: 1 }).toArray(), clientSnapshot, 'Invoice receiver edits must not rewrite master client records');
    // Verify physical-branch configuration and independent atomic fiscal counters
    // in this disposable database. No document is submitted to a fiscal provider.
    await request('PUT', `/branches/${objectId(8002)}`, { billingSeriesCode: '1', sunatEstablishmentCode: '0000' }, 200);
    for (const code of ['2', '3']) {
      const branch = await request('POST', '/branches', { code: `TEST-${code}`, name: `Sucursal prueba ${code}`, companyIds: [objectId(8001)], billingSeriesCode: code, sunatEstablishmentCode: `000${code}` });
      assert.equal(branch.billingSeriesCode, code); assert.equal(branch.sunatEstablishmentCode, `000${code}`);
    }
    await request('POST', '/branches', { code: 'TEST-DUPLICATE', name: 'Duplicada', companyIds: [objectId(8001)], billingSeriesCode: '2' }, 409);
    await request('PUT', `/branches/${objectId(8002)}`, { billingSeriesCode: '3' }, 400);
    const { BillingDocumentSchema, BillingCounterSchema } = require('../dist/infrastructure/database/mongodb/schemas/billing-document.schema');
    const { MongoBillingDocumentRepository } = require('../dist/infrastructure/database/mongodb/repositories/mongo-billing-document.repository');
    const { SaleSchema } = require('../dist/infrastructure/database/mongodb/schemas/sale.schema');
    const repository = new MongoBillingDocumentRepository(database.model('TestBilling', BillingDocumentSchema, 'billing_documents'), database.model('TestCounter', BillingCounterSchema, 'billing_counters'), database.model('TestFiscalSale', SaleSchema, 'sales'));
    await repository.onModuleInit();
    const changes = await Promise.all(['CLIENTE A', 'CLIENTE B'].map(name => repository.updateReceiver(lastReceiverDraft.id, objectId(8002), { ...lastReceiverDraft.receiver, name }, objectId(8003), 1)));
    assert.equal(changes.filter(Boolean).length, 1, 'Only one concurrent receiver edit can win the revision');
    assert.equal(await repository.claimDraft(lastReceiverDraft.id, objectId(8002), objectId(8003), 1), null, 'A stale confirmation cannot claim the invoice for sending');

    for (const series of ['FAG1', 'FAG2', 'FAG3']) {
      const values = await Promise.all(Array.from({ length: 20 }, () => repository.reserveNumber('20100070970', series, 'beta', 1)));
      assert.deepEqual(values.sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 1));
    }
    const summaries = await Promise.all(Array.from({ length: 12 }, () => repository.reserveNumber('20100070970', 'RC-2026-11-17', 'beta', 1, 99_999)));
    assert.equal(new Set(summaries).size, 12, 'All branches share one daily summary sequence');
    assert.equal(await repository.reserveNumber('20100070970', 'RC-RANGE-TEST', 'beta', 100, 100), 100);
    await assert.rejects(repository.reserveNumber('20100070970', 'RC-RANGE-TEST', 'beta', 100, 100), /agotada/, 'A reserved range must never spill into another system’s range');
  } catch (error) {
    // All children use generated fixture credentials; logs are retained locally for diagnosis.
    error.message += ` (logs locales: ${temporary})`; throw error;
  } finally {
    if (database) await database.close();
    for (const child of processes.reverse()) await stop(child);
    for (const descriptor of descriptors) closeSync(descriptor);
  }
});
