require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createServer } = require('node:http');
const { Module, UnauthorizedException } = require('@nestjs/common');
const { NestFactory, Reflector } = require('@nestjs/core');
const mongoose = require('mongoose');
const { buildCreditNote, creditNoteAvailability } = require('../dist/application/services/credit-note-calculation');
const { BillingCreditNoteService } = require('../dist/application/services/billing-credit-note.service');
const { GreenterBillingProvider } = require('../dist/infrastructure/billing/greenter-billing.provider');
const { BillingCreditNoteSchema } = require('../dist/infrastructure/database/mongodb/schemas/billing-credit-note.schema');
const { BillingDocumentSchema, BillingCounterSchema } = require('../dist/infrastructure/database/mongodb/schemas/billing-document.schema');
const { MongoBillingDocumentRepository } = require('../dist/infrastructure/database/mongodb/repositories/mongo-billing-document.repository');
const { MongoBillingCreditNoteRepository } = require('../dist/infrastructure/database/mongodb/repositories/mongo-billing-credit-note.repository');
const { validationPipe } = require('../dist/presentation/pipes/validation.pipe');
const { CreateCreditNoteDto } = require('../dist/application/dtos/billing/credit-note.dto');
const { BillingCreditNoteController } = require('../dist/presentation/controllers/billing-credit-note.controller');
const { BranchAccessGuard } = require('../dist/presentation/guards/branch-access.guard');
const { RolesGuard } = require('../dist/presentation/guards/roles.guard');
const { ResponseTransformInterceptor } = require('../dist/presentation/interceptors/response-transform.interceptor');
const { HttpExceptionFilter } = require('../dist/presentation/filters/http-exception.filter');
const ids = Object.fromEntries(['original','branch','company','sale','product','user','foreign'].map(name=>[name,new mongoose.Types.ObjectId().toString()]));
function original(overrides={}) {
  return { id:ids.original,branchId:ids.branch,companyId:ids.company,saleId:ids.sale,documentType:'FACTURA',status:'ACCEPTED',hasCdr:true,series:'FAG1',number:1,environment:'beta',submittedAt:new Date(),currency:'PEN',taxType:'GRAVADO',issuer:{ name:'Emisor',documentType:'RUC',documentNumber:'20100070970',establishmentCode:'0001' },receiver:{ name:'Cliente',documentType:'RUC',documentNumber:'20600000001' },paymentCondition:'CONTADO',saleDate:new Date(),warnings:[],legacyTaxData:false,items:[{ productId:ids.product,description:'Producto histórico',unit:'UND',quantity:3,unitPrice:1,taxType:'GRAVADO',taxRate:.18,baseAmount:2.54,taxAmount:.46,total:3 }],taxableAmount:2.54,exemptAmount:0,unaffectedAmount:0,taxAmount:.46,total:3,...overrides };
}
const partial = quantity=>({ returnType:'PARTIAL',reason:'Devolución por producto',items:[{ itemIndex:0,quantity }] });

test('partial credit notes preserve historical recipient, price, unit and taxes; final cents reconcile',()=>{
  const source=original(); const previous=[];
  for (let index=0;index<3;index++) {
    const note=buildCreditNote(source,previous,partial(1));
    assert.equal(note.total,1);assert.equal(note.reasonCode,'07');assert.deepEqual(note.receiver,source.receiver);
    assert.equal(note.items[0].description,'Producto histórico');assert.equal(note.items[0].unitPrice,1);
    previous.push({ ...note,status:'ACCEPTED' });
  }
  assert.equal(previous.reduce((sum,note)=>sum+Math.round(note.taxAmount*100),0),46);
  assert.equal(previous.reduce((sum,note)=>sum+Math.round(note.taxableAmount*100),0),254);
  assert.equal(creditNoteAvailability(source,previous)[0].availableQuantity,0);
  assert.throws(()=>buildCreditNote(source,previous,partial(1)),/saldo disponible/);
});
test('full returns use 06; a later return of the remaining balance uses 07',()=>{
  const source=original();
  const full=buildCreditNote(source,[],{ returnType:'TOTAL',reason:'Devolución total' });
  assert.equal(full.reasonCode,'06');assert.equal(full.total,3);
  const first={ ...buildCreditNote(source,[],partial(1)),status:'ACCEPTED' };
  const rest=buildCreditNote(source,[first],{ returnType:'TOTAL',reason:'Devolución restante' });
  assert.equal(rest.reasonCode,'07');assert.equal(rest.items[0].quantity,2);assert.equal(rest.total,2);
});
test('pending, unknown and draft returns hold quantities; rejected and discarded ones release them',()=>{
  const source=original(),note=buildCreditNote(source,[],partial(2));
  for(const status of ['DRAFT','SENDING','PENDING','UNKNOWN','ACCEPTED']) assert.equal(creditNoteAvailability(source,[{...note,status}])[0].availableQuantity,1,status);
  for(const status of ['REJECTED','DISCARDED']) assert.equal(creditNoteAvailability(source,[{...note,status}])[0].availableQuantity,3,status);
});
test('quantities, repeated rows and original fiscal state are validated before issuing',()=>{
  for(const value of [0,-1,NaN,Infinity,4,.0000001]) assert.throws(()=>buildCreditNote(original(),[],partial(value)));
  assert.throws(()=>buildCreditNote(original(),[],{ ...partial(1),items:[{itemIndex:0,quantity:1},{itemIndex:0,quantity:1}] }),/sin repetir/);
  assert.throws(()=>buildCreditNote(original(),[],{ ...partial(1),items:[{itemIndex:1,quantity:1}] }),/no pertenece/);
  for(const state of ['DRAFT','PENDING','UNKNOWN','REJECTED']) assert.throws(()=>buildCreditNote(original({status:state}),[],partial(1)),/aceptado/);
  assert.throws(()=>buildCreditNote(original({hasCdr:false}),[],partial(1)),/CDR/);
});
test('exempt goods, duplicate product IDs on separate lines and fractional units retain their own balances',()=>{
  const source=original({ documentType:'BOLETA',series:'BAG1',taxType:'EXONERADO',taxableAmount:0,exemptAmount:4,taxAmount:0,total:4 });
  source.items=[0,1].map(()=>({ ...source.items[0],quantity:1.5,unitPrice:4/3,baseAmount:2,taxAmount:0,total:2,taxType:'EXONERADO',taxRate:0 }));
  const note=buildCreditNote(source,[],{ ...partial(.5),items:[{itemIndex:1,quantity:.5}] });
  assert.equal(note.exemptAmount,.67);assert.equal(note.taxAmount,0);assert.equal(note.items[0].originalItemIndex,1);
  const available=creditNoteAvailability(source,[note]);assert.equal(available[0].availableQuantity,1.5);assert.equal(available[1].availableQuantity,1);
});
test('DTO rejects client-supplied prices and requires an explicit idempotency key',async()=>{
  const dto={ originalDocumentId:ids.original,...partial(1),requestId:randomUUID() };
  await validationPipe.transform(dto,{ type:'body',metatype:CreateCreditNoteDto });
  await assert.rejects(()=>validationPipe.transform({ ...dto,total:1 },{type:'body',metatype:CreateCreditNoteDto}));
  await assert.rejects(()=>validationPipe.transform({ ...dto,requestId:undefined },{type:'body',metatype:CreateCreditNoteDto}));
});
test('provider builds type 07 with affected document and historical amounts',()=>{
  const provider=new GreenterBillingProvider({ get:()=>undefined });
  const note={ ...buildCreditNote(original(),[],partial(1)),series:'FNC1',number:2,submittedAt:new Date() };
  const payload=provider.buildCreditNotePayload(note);
  assert.equal(payload.tipoDoc,'07');assert.equal(payload.tipDocAfectado,'01');assert.equal(payload.numDocAfectado,'FAG1-00000001');assert.equal(payload.codMotivo,'07');assert.equal(payload.items[0].cantidad,1);assert.equal(payload.mtoImpVenta,1);
});
test('service isolates branches and does not claim or submit when the capability is missing',async()=>{
  const source=original();const note={ ...buildCreditNote(source,[],partial(1)),id:new mongoose.Types.ObjectId().toString() };
  let claims=0,sends=0;
  const service=new BillingCreditNoteService({findById:async()=>source},{findById:async()=>note,forOriginal:async()=>[note],claimDraft:async()=>{claims++;}}, {getStatus:async()=>({ready:true,environment:'beta'}),submitCreditNote:async()=>{sends++;}}, {findById:async()=>({isActive:true,ruc:source.issuer.documentNumber})});
  await assert.rejects(()=>service.findById(note.id,ids.foreign),/sucursal/);
  await assert.rejects(()=>service.issue(note.id,{id:ids.branch,companyIds:[ids.company]},ids.user),/habilita/);
  assert.equal(claims,0);assert.equal(sends,0);
});

test('credit-note HTTP routes require authentication, branch access and explicit confirmation',async()=>{
  let issued=0;
  const fixture={ list:async()=>({data:[],total:0}),issue:async()=>{issued++;return{status:'ACCEPTED'};},artifact:async()=>({filename:'R-test.zip',data:Buffer.from('PKfixture').toString('base64')}) };
  class TestModule {}
  Module({controllers:[BillingCreditNoteController],providers:[{provide:BillingCreditNoteService,useValue:fixture}]})(TestModule);
  const app=await NestFactory.create(TestModule,{logger:false});
  app.useGlobalPipes(validationPipe);
  app.useGlobalGuards({canActivate:context=>{const request=context.switchToHttp().getRequest();if(request.headers.authorization!=='Bearer test-only')throw new UnauthorizedException();request.user={id:ids.user,role:request.headers['x-test-role'] || 'ADMIN'};return true;}},new BranchAccessGuard(new Reflector(),{findById:async id=>id===ids.branch?{id,isActive:true}:null},{findById:async()=>({isActive:true,branchAssignments:[]})}),new RolesGuard(new Reflector()));
  app.useGlobalFilters(new HttpExceptionFilter());app.useGlobalInterceptors(new ResponseTransformInterceptor());
  await app.listen(0,'127.0.0.1');
  try {
    const origin=await app.getUrl();
    const headers={authorization:'Bearer test-only','x-branch-id':ids.branch,'content-type':'application/json'};
    assert.equal((await fetch(origin+'/billing/credit-notes')).status,401);
    assert.equal((await fetch(origin+'/billing/credit-notes',{headers:{authorization:'Bearer test-only'}})).status,400);
    assert.equal((await fetch(origin+'/billing/credit-notes',{headers:{...headers,'x-test-role':'ALMACENERO'}})).status,403);
    assert.equal((await fetch(origin+'/billing/credit-notes',{headers:{...headers,'x-branch-id':ids.foreign}})).status,404);
    assert.equal((await fetch(origin+'/billing/credit-notes',{headers})).status,200);
    for(const confirm of [false,'true',1,undefined]) assert.equal((await fetch(origin+`/billing/credit-notes/${ids.original}/issue`,{method:'POST',headers,body:JSON.stringify({confirm})})).status,400);
    assert.equal(issued,0);
    assert.equal((await fetch(origin+`/billing/credit-notes/${ids.original}/issue`,{method:'POST',headers,body:JSON.stringify({confirm:true})})).status,201);assert.equal(issued,1);
    const file=await fetch(origin+`/billing/credit-notes/${ids.original}/files/cdr`,{headers});assert.equal(file.status,200);assert.equal(Buffer.from(await file.arrayBuffer()).toString(),'PKfixture');assert.match(file.headers.get('content-disposition'),/R-test.zip/);
  } finally {await app.close();}
});

test('real HTTP adapter negotiates credit-note capabilities and sends type 07 to the new endpoints',async()=>{
  const source=original();const note={...buildCreditNote(source,[],partial(1)),series:'FNC1',number:1,submittedAt:new Date()};
  const calls=[];
  const server=createServer(async(request,response)=>{
    response.setHeader('Content-Type','application/json');
    if(request.url.endsWith('/capabilities')) { response.end(JSON.stringify({apiVersion:'agromax-1',ready:true,environment:'beta',issuer:{ruc:source.issuer.documentNumber,razonSocial:'Emisor'},supportedDocumentTypes:['FACTURA','BOLETA','NOTA_CREDITO'],boletaSubmissionMode:'individual'}));return; }
    let body='';for await(const chunk of request)body+=chunk;
    calls.push({path:request.url,body:JSON.parse(body),authorization:request.headers.authorization});
    response.end(JSON.stringify({invoiceNumber:'FNC1-00000001',emisorRuc:source.issuer.documentNumber,environment:'beta',status:'ACCEPTED',sunatResponse:{code:'0',description:'Accepted fixture'},cdrBase64:Buffer.from('PKfixture').toString('base64')}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const settings={GREENTER_SERVICE_URL:`http://127.0.0.1:${server.address().port}`,GREENTER_API_KEY:'offline-key',GREENTER_ISSUER_RUC:source.issuer.documentNumber,GREENTER_ENVIRONMENT:'beta',GREENTER_ENABLED:'true',GREENTER_BRANCH_NUMBERING:'true',GREENTER_FACTURA_NEXT_NUMBER:'1',GREENTER_BOLETA_NEXT_NUMBER:'1'};
    const provider=new GreenterBillingProvider({get:key=>settings[key]});
    const status=await provider.getStatus('1');assert.equal(status.creditNotes.ready,true);assert.deepEqual(status.creditNotes.series,{FACTURA:'FNC1',BOLETA:'BNC1'});
    assert.equal((await provider.submitCreditNote(note)).status,'ACCEPTED');assert.equal((await provider.checkCreditNoteStatus(note)).status,'ACCEPTED');
    assert.deepEqual(calls.map(call=>call.path),['/api/agromax/credit-notes/generate','/api/agromax/credit-notes/status']);
    assert.equal(calls[0].body.tipoDoc,'07');assert.equal(calls[0].body.tipDocAfectado,'01');assert.equal(calls[0].body.numDocAfectado,'FAG1-00000001');assert.equal(calls[1].body.tipoDoc,'07');assert.equal(calls[0].authorization,'Bearer offline-key');
  } finally {await new Promise(resolve=>server.close(resolve));}
});

test('Mongo transactions serialize returns, preserve invoice snapshots, and recover results without duplication',{skip:!process.env.AGROMAX_TEST_MONGO_URI},async()=>{
  assert.match(process.env.AGROMAX_TEST_MONGO_URI,/^mongodb:\/\/(127\.0\.0\.1|localhost):/, 'Integration tests require a disposable local database');
  const connection=await mongoose.createConnection(process.env.AGROMAX_TEST_MONGO_URI,{dbName:'credit_notes_'+randomUUID().replace(/-/g,'')}).asPromise();
  try {
    const originals=connection.model('BillingDocument',BillingDocumentSchema.clone());
    const notes=connection.model('BillingCreditNote',BillingCreditNoteSchema.clone());
    const repository=new MongoBillingCreditNoteRepository(notes,originals);await repository.onModuleInit();
    const source=original();const {id,branchId,companyId,saleId,...data}=source;
    await originals.create({...data,_id:id,branch:branchId,company:companyId,sale:saleId});
    const build=(original,previous)=>({...buildCreditNote(original,previous,partial(1)),createdBy:ids.user});
    const request=randomUUID();
    const attempts=await Promise.allSettled([repository.createDraft(id,branchId,request,'hash',build),repository.createDraft(id,branchId,randomUUID(),'hash2',build)]);
    assert.equal(attempts.filter(result=>result.status==='fulfilled').length,1);
    let note=attempts.find(result=>result.status==='fulfilled').value;
    const stored=await notes.findById(note.id).lean();
    const replay=await repository.createDraft(id,branchId,stored.requestId,stored.requestHash,build);
    assert.equal(replay.id,note.id);assert.equal(await notes.countDocuments(),1);
    await assert.rejects(()=>repository.createDraft(id,branchId,stored.requestId,'changed',build),/otros datos/);
    const claimed=await Promise.all([repository.claimDraft(note.id,branchId,ids.user),repository.claimDraft(note.id,branchId,ids.user)]);
    assert.equal(claimed.filter(Boolean).length,1);
    await repository.setSubmission(note.id,branchId,{series:'FNC1',number:1});
    note=await repository.saveResult(note.id,branchId,{status:'UNKNOWN',sunatDescription:'Timeout'});
    await assert.rejects(()=>repository.createDraft(id,branchId,randomUUID(),'3',build),/pendiente de resolver/);
    note=await repository.saveResult(note.id,branchId,{status:'ACCEPTED',sunatDescription:'Aceptada',cdrBase64:Buffer.from('PKfixture').toString('base64')});
    assert.equal(note.hasCdr,true);assert.equal(note.total,1);
    const next=await repository.createDraft(id,branchId,randomUUID(),'4',build);assert.equal(next.items[0].quantity,1);
    const discarded=await repository.discard(next.id,branchId,'Corregir selección',ids.user);assert.equal(discarded.status,'DISCARDED');
    const remaining=await repository.createDraft(id,branchId,randomUUID(),'5',(original,previous)=>buildCreditNote(original,previous,{returnType:'TOTAL',reason:'Devolución restante'}));assert.equal(remaining.total,2);
    const counters=connection.model('BillingCounter',BillingCounterSchema.clone());
    const documents=new MongoBillingDocumentRepository(originals,counters);await documents.onModuleInit();
    // The first note above already used number 1. The next reservation must advance it.
    assert.equal(await documents.reserveNumber(source.issuer.documentNumber,'FNC1','beta',1),1);
    let submitted=0,queried=0;
    const provider={getStatus:async()=>({ready:true,environment:'beta',issuerRuc:source.issuer.documentNumber,boletaSubmissionMode:'individual',creditNotes:{ready:true,series:{FACTURA:'FNC1',BOLETA:'BNC1'}}}),getCreditNoteNumberingStart:()=>1,submitCreditNote:async note=>{submitted++;assert.equal(note.number,2);return{status:'UNKNOWN',sunatDescription:'Network result uncertain'};},checkCreditNoteStatus:async()=>{queried++;return{status:'ACCEPTED',sunatDescription:'CDR recovered',cdrBase64:Buffer.from('PKcdr').toString('base64')};}};
    const service=new BillingCreditNoteService(documents,repository,provider,{findById:async()=>({isActive:true,ruc:source.issuer.documentNumber})});
    const branch={id:branchId,companyIds:[companyId],billingSeriesCode:'1'};
    const issues=await Promise.allSettled([service.issue(remaining.id,branch,ids.user),service.issue(remaining.id,branch,ids.user)]);
    assert.equal(issues.filter(result=>result.status==='fulfilled').length,1);assert.equal(submitted,1);
    await assert.rejects(()=>service.issue(remaining.id,branch,ids.user),/ya fue procesada/);
    const recovered=await service.checkStatus(remaining.id,branchId);assert.equal(recovered.status,'ACCEPTED');assert.equal(queried,1);assert.equal(submitted,1);
    await service.checkStatus(remaining.id,branchId);assert.equal(queried,1);
    assert.equal((await service.availability(id,branch)).items[0].availableQuantity,0);
    assert.equal((await counters.findOne({issuerRuc:source.issuer.documentNumber,series:'FNC1',environment:'beta'}).lean()).sequence,2);
    const current=await originals.findById(id).lean();assert.deepEqual(current.items,source.items);assert.deepEqual(current.receiver,source.receiver);assert.equal(current.status,'ACCEPTED');assert.equal(current.total,3);
    assert.equal(await connection.collection('stocks').countDocuments(),0);assert.equal(await connection.collection('sales').countDocuments(),0);
    assert.equal((await repository.forOriginal(id,ids.foreign)).length,0);assert.equal(await repository.findById(note.id,ids.foreign),null);
    assert.equal((await repository.artifact(note.id,branchId,'cdr')).filename,'R-20100070970-07-FNC1-00000001.zip');
    assert.equal(note.cdrBase64,undefined);assert.equal(note.requestHash,undefined);
  } finally { await connection.dropDatabase();await connection.close(); }
});
