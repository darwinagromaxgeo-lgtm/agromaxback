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
const { BillingService } = require('../dist/application/services/billing.service');
const { GreenterBillingProvider } = require('../dist/infrastructure/billing/greenter-billing.provider');
const { BillingCreditNoteSchema } = require('../dist/infrastructure/database/mongodb/schemas/billing-credit-note.schema');
const { BillingDocumentSchema, BillingCounterSchema } = require('../dist/infrastructure/database/mongodb/schemas/billing-document.schema');
const { MongoBillingDocumentRepository } = require('../dist/infrastructure/database/mongodb/repositories/mongo-billing-document.repository');
const { MongoBillingCreditNoteRepository } = require('../dist/infrastructure/database/mongodb/repositories/mongo-billing-credit-note.repository');
const { SaleSchema } = require('../dist/infrastructure/database/mongodb/schemas/sale.schema');
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
test('cancellation uses reason 01 for the complete original and refuses previously credited or cancelled documents',()=>{
  const source=original();
  const note=buildCreditNote(source,[],{returnType:'CANCEL',reason:'Anular comprobante para emitir uno nuevo'});
  assert.equal(note.reasonCode,'01');assert.equal(note.total,source.total);assert.equal(note.items[0].quantity,3);
  assert.deepEqual(note.receiver,source.receiver);
  assert.throws(()=>buildCreditNote(source,[{...buildCreditNote(source,[],partial(1)),status:'ACCEPTED'}],{returnType:'CANCEL',reason:'Anular'}),/sin notas previas/);
  assert.throws(()=>buildCreditNote({...source,cancelledByCreditNoteId:ids.foreign},[],{returnType:'CANCEL',reason:'Anular'}),/ya está anulado/);
  assert.throws(()=>buildCreditNote(source,[],{returnType:'CANCEL',reason:'Anular',items:[{itemIndex:0,quantity:1}]}),/comprobante completo/);
});
test('pending, unknown and draft returns hold quantities; rejected and discarded ones release them',()=>{
  const source=original(),note=buildCreditNote(source,[],partial(2));
  for(const status of ['DRAFT','SENDING','PENDING','UNKNOWN','ACCEPTED']) assert.equal(creditNoteAvailability(source,[{...note,status}])[0].availableQuantity,1,status);
  for(const status of ['REJECTED','DISCARDED']) assert.equal(creditNoteAvailability(source,[{...note,status}])[0].availableQuantity,3,status);
});

test('accepted fiscal cancellation unlocks exactly one replacement without changing the order, money or inventory',{skip:!process.env.AGROMAX_TEST_MONGO_URI},async()=>{
  assert.match(process.env.AGROMAX_TEST_MONGO_URI,/^mongodb:\/\/(127\.0\.0\.1|localhost):/);
  const connection=await mongoose.createConnection(process.env.AGROMAX_TEST_MONGO_URI,{dbName:'cancellation_'+randomUUID().replace(/-/g,'')}).asPromise();
  try {
    const originals=connection.model('BillingDocument',BillingDocumentSchema.clone());
    const notes=connection.model('BillingCreditNote',BillingCreditNoteSchema.clone());
    const counters=connection.model('BillingCounter',BillingCounterSchema.clone());
    const sales=connection.model('SaleDocument',SaleSchema.clone());
    const documents=new MongoBillingDocumentRepository(originals,counters,sales);
    const repository=new MongoBillingCreditNoteRepository(notes,originals,sales);
    await documents.onModuleInit();await repository.onModuleInit();
    const source=original({number:10});const {id,branchId,companyId,saleId,...data}=source;
    await originals.create({...data,_id:id,branch:branchId,company:companyId,sale:saleId,xmlBase64:Buffer.from('<Invoice/>').toString('base64'),pdfBase64:Buffer.from('%PDF-old').toString('base64')});
    const sale={id:saleId,branchId,total:3,isCancelled:false,items:source.items,payments:[{amount:3,paymentMethodId:ids.foreign}]};
    await sales.create({_id:saleId,branch:branchId,company:companyId,total:sale.total,voucherType:'FACTURA',date:new Date(),items:source.items.map(item=>({product:item.productId,company:companyId,quantity:item.quantity,unitPrice:item.unitPrice,subtotal:item.total,priceTier:'Minorista'})),payments:[{paymentMethod:ids.foreign,paymentMethodName:'Efectivo',amount:3}]});
    await connection.collection('stocks').insertOne({product:ids.product,branch:branchId,quantity:5});
    await connection.collection('cash_registers').insertOne({sale:saleId,amount:3});
    const before={sale:await connection.collection('sales').findOne({}),stock:await connection.collection('stocks').findOne({}),cash:await connection.collection('cash_registers').findOne({})};
    await originals.updateOne({_id:id},{$set:{activeSlot:false}});
    assert.equal(await documents.hasSubmittedSale(saleId),true,'An inactive slot alone does not prove fiscal cancellation');
    await originals.updateOne({_id:id},{$set:{activeSlot:true,cancelledByCreditNote:ids.foreign}});
    assert.equal(await documents.hasSubmittedSale(saleId),true,'A cancellation reference alone does not release an active fiscal slot');
    await originals.updateOne({_id:id},{$unset:{cancelledByCreditNote:1}});
    assert.equal(await documents.reserveNumber(source.issuer.documentNumber,'FAG1','beta',10),10);
    let submissions=0,queries=0;
    const provider={getStatus:async()=>({ready:true,environment:'beta',issuerRuc:source.issuer.documentNumber,supportedDocumentTypes:['FACTURA','BOLETA'],series:{FACTURA:'FAG1',BOLETA:'BAG1'},boletaSubmissionMode:'individual',creditNotes:{ready:true,cancellationReady:true,series:{FACTURA:'FNC1',BOLETA:'BNC1'}}}),getCreditNoteNumberingStart:()=>1,getNumberingStart:()=>1,submitCreditNote:async()=>{submissions++;return submissions===1?{status:'UNKNOWN',sunatDescription:'Timeout'}:{status:'ACCEPTED',sunatCode:'0',sunatDescription:'Accepted cancellation',cdrBase64:Buffer.from('PKcdr').toString('base64')};},checkCreditNoteStatus:async()=>{queries++;return queries===1?{status:'PENDING',ticket:'fixture-ticket',sunatDescription:'Pending'}:{status:'ACCEPTED',sunatCode:'0',sunatDescription:'Accepted cancellation',cdrBase64:Buffer.from('PKcdr').toString('base64')};},submit:async()=>({status:'ACCEPTED',sunatCode:'0',sunatDescription:'New receipt',cdrBase64:Buffer.from('PKcdr').toString('base64')})};
    const companies={findById:async()=>({isActive:true,ruc:source.issuer.documentNumber})};
    const billing=new BillingService(documents,{findById:async()=>structuredClone(sale)},companies,{}, {findById:()=>{throw Error('Historical products must be reused');}},provider);
    const service=new BillingCreditNoteService(documents,repository,provider,companies);
    const branch={id:branchId,companyIds:[companyId],billingSeriesCode:'1'};
    const request={originalDocumentId:id,returnType:'CANCEL',reason:'Anular comprobante; conservar pedido',requestId:randomUUID()};
    const cancellation=await service.create(request,branch,ids.user);
    const reissue={saleId,companyId,taxType:'GRAVADO',documentType:'BOLETA',receiver:{name:'CONSUMIDOR FINAL',documentType:'UNIDENTIFIED'},replacesDocumentId:id};
    await assert.rejects(()=>billing.preview(reissue,branch),/debe aceptarse/);
    assert.equal((await service.issue(cancellation.id,branch,ids.user)).status,'UNKNOWN');
    assert.equal(await documents.hasSubmittedSale(saleId),true,'An uncertain cancellation must still block operational cancellation');
    assert.equal((await sales.findById(saleId).lean()).voucherType,'FACTURA');
    await assert.rejects(()=>billing.preview(reissue,branch),/debe aceptarse/);
    assert.equal((await service.checkStatus(cancellation.id,branchId)).status,'PENDING');
    assert.equal(await documents.hasSubmittedSale(saleId),true,'A pending cancellation must still block operational cancellation');
    assert.equal((await sales.findById(saleId).lean()).voucherType,'FACTURA');
    assert.equal((await originals.findById(id).lean()).activeSlot,true);
    await assert.rejects(()=>billing.preview(reissue,branch),/debe aceptarse/);
    await assert.rejects(()=>repository.saveResult(cancellation.id,branchId,{status:'ACCEPTED',sunatCode:'0',sunatDescription:'No CDR'}),/constancia/);
    await assert.rejects(()=>repository.saveResult(cancellation.id,branchId,{status:'ACCEPTED',sunatCode:'2399',cdrBase64:Buffer.from('PKrejected').toString('base64'),sunatDescription:'Wrong CDR code'}),/constancia/);
    assert.equal((await repository.findById(cancellation.id,branchId)).status,'PENDING');
    assert.equal((await service.checkStatus(cancellation.id,branchId)).status,'ACCEPTED');
    assert.equal((await sales.findById(saleId).lean()).voucherType,'NONE','The accepted cancellation automatically restores the internal sales note');
    const cancelled=await documents.findById(id,branchId);assert.equal(cancelled.cancelledByCreditNoteId,cancellation.id);assert.equal(cancelled.status,'ACCEPTED');
    assert.equal((await originals.findById(id).lean()).activeSlot,false);assert.equal(await documents.findForSale(saleId,companyId,'GRAVADO',branchId),null);
    assert.equal(await documents.hasSubmittedSale(saleId),false,'An accepted full fiscal cancellation permits explicitly cancelling the sale');
    await assert.rejects(()=>billing.createDraft({...reissue,replacesDocumentId:undefined},branch,ids.user),/Volver a emitir/);
    const preview=await billing.preview(reissue,branch);assert.deepEqual(preview.items,source.items);assert.equal(preview.total,3);assert.equal(preview.receiver.documentType,'UNIDENTIFIED');assert.equal(preview.hasCdr,undefined);assert.equal(preview.number,undefined);
    const attempts=await Promise.allSettled([billing.createDraft(reissue,branch,ids.user),billing.createDraft(reissue,branch,ids.user)]);
    const completed=attempts.filter(result=>result.status==='fulfilled').map(result=>result.value);
    assert.ok(completed.length);assert.ok(completed.every(note=>note.id===completed[0].id));assert.equal(await originals.countDocuments(),2);
    let replacement=completed[0];assert.equal(replacement.replacesDocumentId,id);assert.equal(replacement.reissueAfterCreditNoteId,cancellation.id);assert.equal(replacement.documentType,'BOLETA');
    const replay=await billing.createDraft(reissue,branch,ids.user);assert.equal(replay.id,replacement.id);
    assert.equal((await documents.findById(id,branchId)).replacementDocumentId,replacement.id);
    const discardedId=replacement.id;await billing.discard(discardedId,branchId,'Corregir el borrador antes de emitir',ids.user);
    replacement=await billing.createDraft(reissue,branch,ids.user);assert.notEqual(replacement.id,discardedId);
    assert.equal((await documents.findById(id,branchId)).replacementDocumentId,replacement.id);
    const issued=await billing.issue(replacement.id,branch,ids.user);assert.equal(issued.status,'ACCEPTED');assert.equal(issued.series,'BAG1');assert.equal(issued.number,1);
    assert.equal(await documents.hasSubmittedSale(saleId),true,'An accepted replacement blocks operational cancellation again');
    assert.equal((await sales.findById(saleId).lean()).voucherType,'BOLETA','An accepted replacement restores its fiscal type');
    const secondCancellation=await service.create({...request,originalDocumentId:issued.id,requestId:randomUUID()},branch,ids.user);
    assert.equal((await service.issue(secondCancellation.id,branch,ids.user)).status,'ACCEPTED');
    await assert.rejects(()=>billing.preview(reissue,branch),/ya fue reemplazado/);
    const nextDto={...reissue,documentType:'FACTURA',receiver:source.receiver,replacesDocumentId:issued.id};
    const next=await billing.createDraft(nextDto,branch,ids.user);assert.equal(next.replacesDocumentId,issued.id);
    const newInvoice=await billing.issue(next.id,branch,ids.user);assert.equal(newInvoice.series,'FAG1');assert.equal(newInvoice.number,11,'Fiscal counters must advance instead of reusing the cancelled number');
    assert.equal((await sales.findById(saleId).lean()).voucherType,'FACTURA');
    const beforeReplay=await sales.findById(saleId).lean();
    await repository.saveResult(cancellation.id,branchId,{status:'ACCEPTED',sunatCode:'0',sunatDescription:'Repeated status response'});
    assert.deepEqual(await sales.findById(saleId).lean(),beforeReplay,'A replayed cancellation must not change the accepted replacement');
    provider.submitCreditNote=async()=>({status:'REJECTED',sunatCode:'2399',sunatDescription:'Rejected cancellation',cdrBase64:Buffer.from('PKrejected').toString('base64')});
    const rejected=await service.create({...request,originalDocumentId:newInvoice.id,requestId:randomUUID()},branch,ids.user);
    assert.equal((await service.issue(rejected.id,branch,ids.user)).status,'REJECTED');
    assert.equal((await originals.findById(newInvoice.id).lean()).activeSlot,true);
    assert.equal((await documents.findById(newInvoice.id,branchId)).cancelledByCreditNoteId,undefined);
    await assert.rejects(()=>billing.preview({...nextDto,replacesDocumentId:newInvoice.id},branch),/debe aceptarse/);
    const commercialFields=({voucherType,__v,updatedAt,...data})=>data;
    assert.deepEqual(commercialFields(await connection.collection('sales').findOne({})),commercialFields(before.sale));assert.deepEqual(await connection.collection('stocks').findOne({}),before.stock);assert.deepEqual(await connection.collection('cash_registers').findOne({}),before.cash);
    assert.equal((await documents.getArtifact(id,branchId,'xml')).data,Buffer.from('<Invoice/>').toString('base64'));
    assert.equal((await documents.getArtifact(id,branchId,'pdf')).data,Buffer.from('%PDF-old').toString('base64'));
    await assert.rejects(()=>billing.preview({...nextDto,saleId:ids.foreign},branch),/mismo pedido/);
  } finally {await connection.dropDatabase();await connection.close();}
});
test('only the final accepted cancellation resets the sale, including concurrent tax groups and foreign-branch rollback',{skip:!process.env.AGROMAX_TEST_MONGO_URI},async()=>{
  assert.match(process.env.AGROMAX_TEST_MONGO_URI,/^mongodb:\/\/(127\.0\.0\.1|localhost):/);
  const connection=await mongoose.createConnection(process.env.AGROMAX_TEST_MONGO_URI,{dbName:'sale_note_'+randomUUID().replace(/-/g,'')}).asPromise();
  try {
    const originals=connection.model('BillingDocument',BillingDocumentSchema.clone());
    const notes=connection.model('BillingCreditNote',BillingCreditNoteSchema.clone());
    const sales=connection.model('SaleDocument',SaleSchema.clone());
    const repository=new MongoBillingCreditNoteRepository(notes,originals,sales);
    await repository.onModuleInit();await originals.init();
    const saleId=String(new mongoose.Types.ObjectId());
    await sales.create({_id:saleId,branch:ids.branch,total:6,voucherType:'FACTURA',date:new Date(),items:[{product:ids.product,company:ids.company,quantity:6,unitPrice:1,subtotal:6,priceTier:'Minorista'}],payments:[{paymentMethod:ids.foreign,paymentMethodName:'Efectivo',amount:6}]});
    async function staged(sale,index,taxType='GRAVADO') {
      const source=original({id:String(new mongoose.Types.ObjectId()),saleId:sale,number:index,...(taxType==='EXONERADO'?{taxType,items:[{...original().items[0],taxType,taxRate:0,baseAmount:3,taxAmount:0}],taxableAmount:0,exemptAmount:3,taxAmount:0}:{})});
      const {id,branchId,companyId,saleId:linked,...data}=source;
      await originals.create({...data,_id:id,branch:branchId,company:companyId,sale:linked});
      const note=await repository.createDraft(id,branchId,randomUUID(),randomUUID(),()=>buildCreditNote(source,[],{returnType:'CANCEL',reason:'Error de registro'}));
      await repository.claimDraft(note.id,branchId,ids.user);
      return {source,note};
    }
    const first=await staged(saleId,101),second=await staged(saleId,102,'EXONERADO');
    const accepted={status:'ACCEPTED',sunatCode:'0',sunatDescription:'Accepted fixture',cdrBase64:Buffer.from('PKfixture').toString('base64')};
    await repository.saveResult(first.note.id,ids.branch,accepted);
    assert.equal((await sales.findById(saleId).lean()).voucherType,'FACTURA','Another active tax group still exists');
    await repository.saveResult(second.note.id,ids.branch,{status:'PENDING',sunatDescription:'Awaiting result'});
    assert.equal((await sales.findById(saleId).lean()).voucherType,'FACTURA');
    await repository.saveResult(second.note.id,ids.branch,accepted);
    assert.equal((await sales.findById(saleId).lean()).voucherType,'NONE');

    const concurrentSale=String(new mongoose.Types.ObjectId());
    await sales.create({_id:concurrentSale,branch:ids.branch,total:6,voucherType:'BOLETA',date:new Date(),items:[{product:ids.product,company:ids.company,quantity:6,unitPrice:1,subtotal:6,priceTier:'Minorista'}],payments:[]});
    const left=await staged(concurrentSale,201),right=await staged(concurrentSale,202,'EXONERADO');
    await Promise.all([repository.saveResult(left.note.id,ids.branch,accepted),repository.saveResult(right.note.id,ids.branch,accepted)]);
    assert.equal((await sales.findById(concurrentSale).lean()).voucherType,'NONE','Concurrent completions must serialize on the sale');
    assert.equal(await originals.countDocuments({sale:concurrentSale,activeSlot:true}),0);

    const foreignSale=String(new mongoose.Types.ObjectId());
    await sales.create({_id:foreignSale,branch:ids.foreign,total:3,voucherType:'FACTURA',date:new Date(),items:[{product:ids.product,company:ids.company,quantity:3,unitPrice:1,subtotal:3,priceTier:'Minorista'}],payments:[]});
    const invalid=await staged(foreignSale,301);
    await assert.rejects(()=>repository.saveResult(invalid.note.id,ids.branch,accepted),/venta activa/);
    assert.equal((await repository.findById(invalid.note.id,ids.branch)).status,'SENDING','A failed update must roll back the saved fiscal result');
    assert.equal((await originals.findById(invalid.source.id).lean()).activeSlot,true);
    assert.equal((await sales.findById(foreignSale).lean()).voucherType,'FACTURA');
    for(const collection of ['stocks','cash_registers','credit_accounts'])assert.equal(await connection.collection(collection).countDocuments(),0);
  } finally {await connection.dropDatabase();await connection.close();}
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
  let cancellationEnabled=false;
  const server=createServer(async(request,response)=>{
    response.setHeader('Content-Type','application/json');
    if(request.url.endsWith('/capabilities')) { response.end(JSON.stringify({apiVersion:'agromax-1',ready:true,environment:'beta',issuer:{ruc:source.issuer.documentNumber,razonSocial:'Emisor'},supportedDocumentTypes:['FACTURA','BOLETA','NOTA_CREDITO'],creditNoteReasons:cancellationEnabled?['01','06','07']:['06','07'],boletaSubmissionMode:'individual'}));return; }
    let body='';for await(const chunk of request)body+=chunk;
    calls.push({path:request.url,body:JSON.parse(body),authorization:request.headers.authorization});
    response.end(JSON.stringify({invoiceNumber:'FNC1-00000001',emisorRuc:source.issuer.documentNumber,environment:'beta',status:'ACCEPTED',sunatResponse:{code:'0',description:'Accepted fixture'},cdrBase64:Buffer.from('PKfixture').toString('base64')}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const settings={GREENTER_SERVICE_URL:`http://127.0.0.1:${server.address().port}`,GREENTER_API_KEY:'offline-key',GREENTER_ISSUER_RUC:source.issuer.documentNumber,GREENTER_ENVIRONMENT:'beta',GREENTER_ENABLED:'true',GREENTER_BRANCH_NUMBERING:'true',GREENTER_FACTURA_NEXT_NUMBER:'1',GREENTER_BOLETA_NEXT_NUMBER:'1'};
    const provider=new GreenterBillingProvider({get:key=>settings[key]});
    const status=await provider.getStatus('1');assert.equal(status.creditNotes.ready,true);assert.deepEqual(status.creditNotes.series,{FACTURA:'FNC1',BOLETA:'BNC1'});
    assert.equal(status.creditNotes.cancellationReady,false);cancellationEnabled=true;
    assert.equal((await provider.getStatus('1')).creditNotes.cancellationReady,true);
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
    const sales=connection.model('SaleDocument',SaleSchema.clone());
    const repository=new MongoBillingCreditNoteRepository(notes,originals,sales);await repository.onModuleInit();
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
    const documents=new MongoBillingDocumentRepository(originals,counters,sales);await documents.onModuleInit();
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
