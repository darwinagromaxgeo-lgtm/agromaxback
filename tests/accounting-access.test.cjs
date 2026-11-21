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

test('accounting reads documents and financial data but cannot change operations or bypass its branch assignments', { timeout: 90000 }, async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'agromax-accounting-access-'));
  fs.mkdirSync(path.join(temporary, 'db'));
  const processes = [], descriptors = [];
  const launch = (name, command, args, options = {}) => {
    const log = fs.openSync(path.join(temporary, `${name}.log`), 'a', 0o600); descriptors.push(log);
    const child = spawn(command, args, { ...options, stdio: ['ignore', log, log] }); processes.push(child); return child;
  };
  let connection;
  try {
    const mongoPort = await freePort(), appPort = await freePort();
    const uri = `mongodb://127.0.0.1:${mongoPort}/agromax_mvp_accountingaccess?directConnection=true`;
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
    const branchTemplate = await db.collection('branches').findOne({_id:new mongoose.Types.ObjectId(id(8002))});
    await db.collection('branches').insertOne({...branchTemplate,_id:new mongoose.Types.ObjectId(id(8003)),code:'OTHER',name:'Sucursal no asignada',billingSeriesCode:'99',isMain:false});
    const accountingPassword = randomBytes(18).toString('base64url');
    const accountant = await request('POST', '/users', { username: 'contabilidad-test', password: accountingPassword, fullName: 'Contabilidad sintética', role: 'CONTABILIDAD', branchAssignments: [{ branchId: id(8002), role: 'CONTABILIDAD' }] });
    const { JwtService } = require('@nestjs/jwt');
    const jwt = new JwtService({ secret: jwtSecret });
    const accountantAuthorization = `Bearer ${(await request('POST', '/auth/login', { username: accountant.username, password: accountingPassword })).accessToken}`;
    const cpe = { _id: new mongoose.Types.ObjectId(id(9001)), branch: new mongoose.Types.ObjectId(id(8002)), company: new mongoose.Types.ObjectId(id(8001)), sale: new mongoose.Types.ObjectId(id(9000)), documentType: 'BOLETA', taxType: 'GRAVADO', status: 'ACCEPTED', environment: 'beta', series: 'B001', number: 1, total: 35, issuer: {name:'Emisor de prueba'}, receiver: {name:'Cliente de prueba'}, pdfBase64: Buffer.from('%PDF-test').toString('base64'), xmlBase64: Buffer.from('<test/>').toString('base64'), cdrBase64: Buffer.from('PK-test').toString('base64'), hasPdf:true, hasXml:true, hasCdr:true };
    await db.collection('billing_documents').insertOne(cpe);
    authorization = accountantAuthorization;
    const me = await request('GET','/auth/me'); assert.equal(me.role,'CONTABILIDAD');
    const branches = await request('GET','/branches/accessible'); assert.deepEqual(branches.map(b=>b.id),[id(8002)]);
    for (const route of ['/companies','/categories','/units','/price-tiers','/payment-methods','/products','/suppliers','/clients','/sales','/purchases','/cash-registers/today','/cash-registers','/credits','/accounts-payable','/accounts-payable/alerts','/dashboard/summary','/dashboard/financial-overview','/stock-movements','/stock-adjustments',`/stock/company/${id(8001)}`,`/product-lots?companyId=${id(8001)}`,'/billing/status','/billing/documents','/billing/credit-notes']) await request('GET',route);
    const document = await request('GET','/billing/documents/'+id(9001));assert.equal(document.status,'ACCEPTED');
    for (const format of ['pdf','xml','cdr']) {
      const response=await fetch(`http://127.0.0.1:${appPort}/api/billing/documents/${id(9001)}/files/${format}`,{headers:{Authorization:authorization,'x-branch-id':id(8002)}});
      assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),Buffer.from(cpe[format+'Base64'],'base64'));
    }
    const collections=['sales','purchases','billing_documents','billing_credit_notes','stocks','stock_movements','cash_registers','credit_accounts','accounts_payable','payment_agreements'];
    const snapshot=async()=>{const result={};for(const collection of collections) result[collection]=JSON.stringify(await db.collection(collection).find().sort({_id:1}).toArray());return result;};
    const before = await snapshot();
    const denied = [
      ['GET','/users'],['GET','/branches'],['GET','/quotes'],['GET','/loans'],['GET','/lookup/ruc/20123456789'],
      ['POST','/users',{}],['PUT','/users/'+accountant.id,{role:'ADMIN'}],['POST','/auth/register',{}],
      ['POST','/sales',{}],['DELETE','/sales/'+id(9000),{reason:'No autorizado'}],['PATCH','/sales/'+id(9000)+'/voucher',{voucherType:'NONE'}],
      ['POST','/purchases',{}],['POST','/purchases/'+id(9000)+'/receive',{}],['PATCH','/purchases/'+id(9000),{}],
      ['POST','/cash-registers/open',{}],['POST','/cash-registers/'+id(9000)+'/entries',{}],['POST','/cash-registers/'+id(9000)+'/close',{}],['PATCH','/cash-registers/'+id(9000)+'/opening-balance',{}],
      ['POST','/credits/'+id(9000)+'/payments',{}],['POST','/credits/payments/batch',{}],['PATCH','/credits/'+id(9000),{}],['DELETE','/credits/'+id(9000),{}],
      ['POST','/accounts-payable/'+id(9000)+'/payments',{}],['POST','/payment-agreements',{}],['POST','/payment-agreements/'+id(9000)+'/payments',{}],
      ['POST','/stock-adjustments',{}],['POST','/stock-adjustments/batch',{}],['POST','/stock/transfer',{}],['POST','/product-lots',{}],['PATCH','/product-lots/'+id(9000),{}],
      ['POST','/clients',{}],['PUT','/clients/'+id(8020),{}],['POST','/companies',{}],['POST','/categories',{}],['POST','/units',{}],
      ['POST','/billing/preview',{}],['POST','/billing/documents',{}],['POST','/billing/documents/'+id(9001)+'/receiver',{}],['POST','/billing/documents/'+id(9001)+'/issue',{}],['POST','/billing/documents/'+id(9001)+'/discard',{}],['POST','/billing/documents/'+id(9001)+'/check-status',{}],
      ['POST','/billing/credit-notes',{}],['POST','/billing/credit-notes/'+id(9000)+'/issue',{}],['POST','/billing/credit-notes/'+id(9000)+'/check-status',{}],
      ['PATCH','/users/'+id(8003)+'/password',{newPassword:'unauthorized-password'}],
    ];
    for(const [method,route,body] of denied) await request(method,route,body,403);
    assert.deepEqual(await snapshot(),before,'Denied requests must not alter operational records');
    await request('GET','/billing/documents',undefined,403,id(8003));
    // A stale ADMIN claim cannot override the current accounting role.
    authorization=`Bearer ${jwt.sign({sub:accountant.id,username:accountant.username,role:'ADMIN'})}`;
    await request('POST','/stock-adjustments',{},403);await request('GET','/users',undefined,403);
    authorization=accountantAuthorization;
    await request('PATCH','/users/'+accountant.id+'/password',{currentPassword:accountingPassword,newPassword:accountingPassword+'x'});
    authorization=adminAuthorization;
    await request('GET','/users');
    await request('POST','/clients',{name:'Cliente de control del administrador',documentNumber:'87654321'});
    await request('PATCH','/users/'+accountant.id+'/toggle-status',{});
    authorization=accountantAuthorization;await request('GET','/auth/me',undefined,401);
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
