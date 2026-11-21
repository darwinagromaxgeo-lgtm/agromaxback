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

test('bank settings are admin-only and internal note numbers are persistent, concurrent and scoped by branch', { timeout: 90000 }, async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'agromax-commercial-docs-'));
  fs.mkdirSync(path.join(temporary, 'db'));
  const processes = [], descriptors = [];
  const launch = (name, command, args, options = {}) => {
    const log = fs.openSync(path.join(temporary, `${name}.log`), 'a', 0o600); descriptors.push(log);
    const child = spawn(command, args, { ...options, stdio: ['ignore', log, log] }); processes.push(child); return child;
  };
  let connection;
  try {
    const mongoPort = await freePort(), appPort = await freePort();
    const uri = `mongodb://127.0.0.1:${mongoPort}/agromax_mvp_commercialdocs?directConnection=true`;
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
    const oid = value => new mongoose.Types.ObjectId(id(value));
    await db.collection('branches').updateOne({_id:oid(8002)},{$set:{billingSeriesCode:'1'}});
    const template=await db.collection('branches').findOne({_id:oid(8002)});
    await db.collection('branches').insertOne({...template,_id:oid(8003),code:'OTHER',name:'Otra sucursal',billingSeriesCode:'2',isMain:false});
    const beforeCompany=await db.collection('companies').findOne({_id:oid(8001)});
    const account={bank:'Banco de prueba',currency:'PEN',accountNumber:'001234567890',cci:'00123456789012345678',holder:beforeCompany.name,isActive:true};
    const bankRoute='/companies/'+id(8001)+'/bank-accounts';
    const configured=await request('PUT',bankRoute,{accounts:[account],expectedRevision:0});
    assert.equal(configured.bankAccounts[0].accountNumber,account.accountNumber);assert.equal(configured.bankAccountsRevision,1);assert.equal(configured.ruc,beforeCompany.ruc);
    await request('PUT',bankRoute,{accounts:[],expectedRevision:0},409);
    for(const patch of [{cci:'123'},{currency:'EUR'},{bank:'  '},{accountNumber:'not-an-account'}])await request('PUT',bankRoute,{accounts:[{...account,...patch}],expectedRevision:1},400);
    await request('PUT',bankRoute,{accounts:Array.from({length:21},()=>account),expectedRevision:1},400);
    const seller=await request('POST','/users',{username:'quote-seller',password:'test-only-password',fullName:'Vendedor de cotizaciones',role:'VENDEDOR',branchAssignments:[{branchId:id(8002),role:'VENDEDOR'}]});
    const {JwtService}=require('@nestjs/jwt');const jwt=new JwtService({secret:jwtSecret});
    authorization='Bearer '+jwt.sign({sub:seller.id,username:seller.username,role:'VENDEDOR'});
    const companies=await request('GET','/companies');assert.deepEqual(companies.find(c=>c.id===id(8001)).bankAccounts,[account]);
    await request('PUT',bankRoute,{accounts:[],expectedRevision:1},403);
    const quote=await request('POST','/quotes',{companyId:id(8001),clientId:id(8020),items:[{productId:id(8010),companyId:id(8001),quantity:1,priceTier:id(8005),unitPrice:118}]});
    const quoteRead=await request('GET','/quotes/'+quote.id);
    assert.equal(quoteRead.createdByName,seller.fullName);assert.equal(quoteRead.createdBy,seller.id);assert.ok(quoteRead.items[0].productName);assert.ok(quoteRead.clientDetails.name);assert.equal(quoteRead.quoteNumber,quote.quoteNumber);
    authorization=adminAuthorization;
    const accountant=await request('POST','/users',{username:'bank-accountant',password:'test-only-password',fullName:'Contabilidad',role:'CONTABILIDAD',branchAssignments:[{branchId:id(8002),role:'CONTABILIDAD'}]});
    authorization='Bearer '+jwt.sign({sub:accountant.id,username:accountant.username,role:'CONTABILIDAD'});await request('PUT',bankRoute,{accounts:[],expectedRevision:1},403);await request('GET','/companies');
    authorization=adminAuthorization;
    const legacy={branch:oid(8002),items:[],total:35,voucherType:'NONE',isCredit:false,payments:[],date:new Date(),isCancelled:false};
    await db.collection('sales').insertMany([{...legacy,_id:oid(9100)},{...legacy,_id:oid(9101)},{...legacy,branch:oid(8003),_id:oid(9102)}]);
    const before=await db.collection('sales').findOne({_id:oid(9100)});
    const first=await request('POST','/sales/'+id(9100)+'/note-number',{});assert.equal(first.noteSeries,'NV01');assert.equal(first.noteNumber,1);
    const repeats=await Promise.all(Array.from({length:4},()=>request('POST','/sales/'+id(9100)+'/note-number',{})));
    assert.ok(repeats.every(s=>s.noteNumber===1));assert.equal((await db.collection('sale_note_counters').findOne({_id:oid(8002)})).sequence,1);
    const concurrent=await Promise.all(Array.from({length:5},()=>request('POST','/sales/'+id(9101)+'/note-number',{})));
    assert.ok(concurrent.every(s=>s.noteNumber===2));assert.equal((await db.collection('sale_note_counters').findOne({_id:oid(8002)})).sequence,2);
    const after=await db.collection('sales').findOne({_id:oid(9100)});for(const key of ['noteSeries','noteNumber','noteNumberedAt','updatedAt'])delete after[key];assert.deepEqual(after,before,'Assigning an internal number changes no sale amounts, lines, payments or status');
    const other=await request('POST','/sales/'+id(9102)+'/note-number',{},201,id(8003));assert.equal(other.noteSeries,'NV02');assert.equal(other.noteNumber,1);
    await db.collection('branches').insertOne({...template,_id:oid(8004),code:'THIRD',name:'Tercera sucursal',billingSeriesCode:'3',isMain:false});
    await db.collection('sales').insertMany(Array.from({length:5},(_,i)=>({...legacy,branch:oid(8004),_id:oid(9150+i)})));
    const distinct=await Promise.all(Array.from({length:5},(_,i)=>request('POST','/sales/'+id(9150+i)+'/note-number',{},201,id(8004))));
    assert.deepEqual(distinct.map(s=>s.noteNumber).sort((a,b)=>a-b),[1,2,3,4,5]);assert.ok(distinct.every(s=>s.noteSeries==='NV03'));
    const sale=await request('POST','/sales',{voucherType:'NONE',items:[{productId:id(8010),companyId:id(8001),quantity:1,priceTier:id(8005),unitPrice:118}],payments:[{paymentMethodId:id(8006),amount:118}]});
    assert.equal(sale.noteSeries,'NV01');assert.equal(sale.noteNumber,3);assert.equal((await request('GET','/sales/'+sale.id)).noteNumber,3);
    const cancelled=await request('DELETE','/sales/'+sale.id,{reason:'Prueba de conservación del correlativo'});const preserved=await request('GET','/sales/'+sale.id);assert.equal(preserved.noteNumber,3);assert.equal(preserved.isCancelled,true);
    const numbers=await db.collection('sales').find({noteNumber:{$exists:true}}).toArray();assert.equal(new Set(numbers.map(s=>s.branch+':'+s.noteSeries+':'+s.noteNumber)).size,numbers.length);
    authorization='Bearer '+jwt.sign({sub:seller.id,username:seller.username,role:'VENDEDOR'});
    await request('GET','/sales/'+id(9102),undefined,404);await request('POST','/sales/'+id(9102)+'/note-number',{},404);await request('GET','/sales/'+id(9102),undefined,403,id(8003));
    authorization='Bearer '+jwt.sign({sub:accountant.id,username:accountant.username,role:'CONTABILIDAD'});await request('GET','/sales/'+id(9100));await request('POST','/sales/'+id(9100)+'/note-number',{},403);
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
