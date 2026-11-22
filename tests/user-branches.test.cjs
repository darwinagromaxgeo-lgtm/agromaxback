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

test('administrators create users for a branch, keep roles and edit assignments without an email', { timeout: 90000 }, async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'agromax-user-branches-'));
  fs.mkdirSync(path.join(temporary, 'db'));
  const processes = [], descriptors = [];
  const launch = (name, command, args, options = {}) => {
    const log = fs.openSync(path.join(temporary, `${name}.log`), 'a', 0o600); descriptors.push(log);
    const child = spawn(command, args, { ...options, stdio: ['ignore', log, log] }); processes.push(child); return child;
  };
  let connection;
  try {
    const mongoPort = await freePort(), appPort = await freePort();
    const uri = `mongodb://127.0.0.1:${mongoPort}/agromax_mvp_userbranches?directConnection=true`;
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
    const branch=await db.collection('branches').findOne({_id:oid(8002)});
    for(const number of [8100,8101])await db.collection('branches').insertOne({...branch,_id:oid(number),code:'BRANCH'+number,name:'Sucursal '+number,isMain:false});
    const {JwtService}=require('@nestjs/jwt');const jwt=new JwtService({secret:jwtSecret});
    const created=[];
    for(const [number,role] of [[8002,'VENDEDOR'],[8100,'ALMACENERO'],[8101,'CONTABILIDAD']]){
      const assignments=[{branchId:id(number),role}];
      const account=await request('POST','/users',{username:' user-'+number+' ',fullName:' Usuario '+number+' ',password:'test-only-password',email:'   ',role,branchAssignments:assignments});
      assert.equal(account.username,'user-'+number);assert.equal(account.fullName,'Usuario '+number);assert.equal(account.email,undefined);assert.equal(account.role,role);assert.deepEqual(account.branchAssignments,assignments);
      const stored=await request('GET','/users/'+account.id);assert.deepEqual(stored.branchAssignments,assignments);assert.equal(stored.password,undefined);
      created.push(account);
      authorization='Bearer '+jwt.sign({sub:account.id,username:account.username,role});
      assert.deepEqual((await request('GET','/branches/accessible')).map(branch=>branch.id),[id(number)]);
      await request('POST','/users',{username:'escalation',fullName:'No autorizado',password:'test-only-password',role:'ADMIN'},403);
      await request('PUT','/users/'+account.id,{role:'ADMIN'},403);
      authorization=adminAuthorization;
    }
    const active=await request('GET','/users?isActive=true');assert.ok(active.data.length>=4);assert.ok(active.data.every(user=>user.isActive));
    assert.equal((await request('GET','/users?isActive=false')).total,0);
    await request('GET','/users?isActive=invalid',undefined,400);
    await request('POST','/users',{username:created[0].username,fullName:'Duplicado',password:'test-only-password',role:'VENDEDOR',branchAssignments:[{branchId:id(8002),role:'VENDEDOR'}]},409);
    const beforeCount=await db.collection('users').countDocuments();
    await request('POST','/users',{username:'without-branch',fullName:'Sin sucursal',password:'test-only-password',role:'VENDEDOR',branchAssignments:[]},400);
    assert.equal(await db.collection('users').countDocuments(),beforeCount);
    const changed=await request('PUT','/users/'+created[0].id,{email:'',role:'VENDEDOR',branchAssignments:[{branchId:id(8100),role:'VENDEDOR'}]});
    assert.equal(changed.email,undefined);assert.deepEqual(changed.branchAssignments,[{branchId:id(8100),role:'VENDEDOR'}]);assert.equal(changed.role,'VENDEDOR');
    assert.equal((await request('GET','/users?branchId='+id(8002))).data.some(u=>u.id===changed.id),false);
    assert.equal((await request('GET','/users?branchId='+id(8100))).data.some(u=>u.id===changed.id),true);
    await request('PUT','/users/'+changed.id,{branchAssignments:[]},400);
    await request('PUT','/users/'+changed.id,{role:'INVALID'},400);
    await request('PUT','/users/'+changed.id,{email:'invalid'},400);
    for(const account of created.slice(0,2)){
      await request('PUT','/users/'+account.id,{email:account.username+'@example.invalid'});
      await request('PUT','/users/'+account.id,{email:''});
      const stored=await db.collection('users').findOne({_id:new mongoose.Types.ObjectId(account.id)});assert.equal('email' in stored,false,'Cleared optional emails must be absent to preserve the sparse unique index');
    }
    await request('PATCH','/users/'+changed.id+'/toggle-status',{});
    const inactive=await request('GET','/users?isActive=false');assert.deepEqual(inactive.data.map(u=>u.id),[changed.id]);
    assert.equal((await request('GET','/users?isActive=true')).data.some(u=>u.id===changed.id),false);
    const admin=await request('POST','/users',{username:'global-admin',fullName:'Admin de prueba',password:'test-only-password',role:'ADMIN',branchAssignments:[]});
    assert.equal(admin.role,'ADMIN');assert.deepEqual(admin.branchAssignments,[]);
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
