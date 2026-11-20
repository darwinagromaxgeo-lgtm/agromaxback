import { ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BillingCreditNoteEntity } from '../../../../domain/entities/billing-credit-note.entity';
import { BillingDocumentEntity, BillingSubmissionResult } from '../../../../domain/entities/billing-document.entity';
import { IBillingCreditNoteRepository } from '../../../../domain/repositories/billing-credit-note.repository';
import { BillingCreditNote } from '../schemas/billing-credit-note.schema';
import { BillingDocument } from '../schemas/billing-document.schema';
import { SaleDocument } from '../schemas/sale.schema';

@Injectable()
export class MongoBillingCreditNoteRepository implements IBillingCreditNoteRepository, OnModuleInit {
  constructor(
    @InjectModel(BillingCreditNote.name) private readonly model:Model<any>,
    @InjectModel(BillingDocument.name) private readonly originals:Model<any>,
    @InjectModel(SaleDocument.name) private readonly sales:Model<any>,
  ) {}
  async onModuleInit() { await this.model.init(); }

  private entity(document:any): BillingCreditNoteEntity {
    const { _id, branch, company, sale, originalDocument, __v, activeSlot, holdsReservation, requestId, requestHash, creditNoteRevision, pdfBase64, xmlBase64, cdrBase64, ...data } = document;
    return { ...data, id:_id.toString(), branchId:branch.toString(), companyId:company.toString(), saleId:sale.toString(), originalDocumentId:originalDocument?.toString(), createdBy:data.createdBy?.toString(), submittedBy:data.submittedBy?.toString(), discardedBy:data.discardedBy?.toString() };
  }
  async findAll(branchId:string, filter:{ originalDocumentId?:string; companyId?:string; status?:string; page:number; limit:number }) {
    const query:any = { branch:branchId, ...(filter.originalDocumentId ? { originalDocument:filter.originalDocumentId } : {}), ...(filter.companyId ? { company:filter.companyId } : {}), ...(filter.status ? { status:filter.status } : {}) };
    const [documents,total] = await Promise.all([this.model.find(query).sort({ createdAt:-1, _id:-1 }).skip((filter.page-1)*filter.limit).limit(filter.limit).lean().exec(), this.model.countDocuments(query).exec()]);
    return { data:documents.map(document=>this.entity(document)), total };
  }
  async findById(id:string, branchId:string) { const doc=await this.model.findOne({ _id:id, branch:branchId }).lean().exec(); return doc ? this.entity(doc) : null; }
  async forOriginal(id:string, branchId:string) { return (await this.model.find({ originalDocument:id, branch:branchId }).sort({ createdAt:1 }).lean().exec()).map(doc=>this.entity(doc)); }

  async createDraft(originalId:string, branchId:string, requestId:string, requestHash:string, build:(original:BillingDocumentEntity, previous:BillingCreditNoteEntity[])=>BillingCreditNoteEntity) {
    const session=await this.model.db.startSession();
    let result:BillingCreditNoteEntity;
    try {
      await session.withTransaction(async()=>{
        const existing:any=await this.model.findOne({ branch:branchId, requestId }).session(session).lean().exec();
        if (existing) {
          if (existing.requestHash !== requestHash) throw new ConflictException('Esta solicitud ya se utilizó con otros datos');
          result=this.entity(existing); return;
        }
        // Serialize reservations on the original document. Concurrent partial returns cannot overspend it.
        const original:any=await this.originals.findOneAndUpdate({ _id:originalId, branch:branchId, status:'ACCEPTED', cancelledByCreditNote:{$exists:false} }, { $inc:{ creditNoteRevision:1 } }, { new:true, session }).lean().exec();
        if (!original) throw new ConflictException('El comprobante original no está aceptado en esta sucursal');
        const previous:any[]=await this.model.find({ originalDocument:originalId, branch:branchId }).session(session).lean().exec();
        if (previous.some(note=>note.holdsReservation)) throw new ConflictException('Ya existe una nota de crédito en borrador o pendiente de resolver para este comprobante. Ábrela desde Notas de crédito');
        const originalEntity={ ...this.entity(original), documentType:original.documentType } as BillingDocumentEntity;
        const note=build(originalEntity, previous.map(doc=>this.entity(doc)));
        const { id, branchId:noteBranch, companyId, saleId, originalDocumentId, ...data }=note;
        const saved=await this.model.create([{ ...data, branch:noteBranch, company:companyId, sale:saleId, originalDocument:originalDocumentId, requestId, requestHash, holdsReservation:true }], { session });
        result=this.entity(saved[0].toObject());
      }, { readConcern:{ level:'snapshot' }, writeConcern:{ w:'majority' } });
      return result!;
    } catch (error:any) {
      if (error?.code === 11000) throw new ConflictException('Otra solicitud ya creó una nota de crédito. Actualiza el listado');
      throw error;
    } finally { await session.endSession(); }
  }
  async claimDraft(id:string, branchId:string, userId:string) {
    const doc=await this.model.findOneAndUpdate({ _id:id, branch:branchId, status:'DRAFT' }, { $set:{ status:'SENDING', submittedBy:userId, submittedAt:new Date() } }, { new:true, runValidators:true }).lean().exec();
    return doc ? this.entity(doc) : null;
  }
  async discard(id:string, branchId:string, reason:string, userId:string) {
    const doc=await this.model.findOneAndUpdate({ _id:id, branch:branchId, status:'DRAFT' }, { $set:{ status:'DISCARDED', holdsReservation:false, discardReason:reason, discardedBy:userId, discardedAt:new Date() } }, { new:true, runValidators:true }).lean().exec();
    return doc ? this.entity(doc) : null;
  }
  async setSubmission(id:string, branchId:string, data:Partial<BillingCreditNoteEntity>) {
    const changed=await this.model.updateOne({ _id:id, branch:branchId, status:'SENDING' }, { $set:data }).exec();
    if (changed.matchedCount !== 1) throw new ConflictException('La nota de crédito cambió durante el envío');
  }
  async saveResult(id:string, branchId:string, result:BillingSubmissionResult) {
    const session=await this.model.db.startSession();
    let saved:BillingCreditNoteEntity;
    try {
      await session.withTransaction(async()=>{
        const doc:any=await this.model.findOneAndUpdate({ _id:id, branch:branchId, status:{ $in:['SENDING','PENDING','UNKNOWN'] } }, { $set:{ ...result, holdsReservation:!['ACCEPTED','REJECTED'].includes(result.status), ...(result.pdfBase64 ? { hasPdf:true } : {}), ...(result.xmlBase64 ? { hasXml:true } : {}), ...(result.cdrBase64 ? { hasCdr:true } : {}) } }, { new:true, runValidators:true,session }).select('+cdrBase64').lean().exec();
        if (!doc) {
          const current:any=await this.model.findOne({_id:id,branch:branchId}).session(session).lean().exec();
          if (current && ['ACCEPTED','REJECTED'].includes(current.status)) {saved=this.entity(current);return;}
          throw new ConflictException('No se pudo guardar la respuesta de la nota de crédito');
        }
        if (doc.reasonCode==='01' && doc.status==='ACCEPTED') {
          if (doc.sunatCode!=='0' || !doc.cdrBase64 || Buffer.from(doc.cdrBase64,'base64').subarray(0,2).toString()!=='PK') throw new ConflictException('La anulación requiere la constancia de SUNAT aceptada');
          const original:any=await this.originals.findOne({_id:doc.originalDocument,branch:branchId,status:'ACCEPTED'}).session(session).lean().exec();
          const cents=(value:number)=>Math.round(value*100);
          const complete=original && original.company.equals(doc.company) && original.sale.equals(doc.sale)
            && cents(doc.total)===cents(original.total) && cents(doc.taxAmount)===cents(original.taxAmount)
            && doc.items.length===original.items.length && new Set(doc.items.map((line:any)=>line.originalItemIndex)).size===original.items.length
            && doc.items.every((line:any)=>{const source=original.items[line.originalItemIndex];return source && line.productId===source.productId && line.quantity===source.quantity && cents(line.baseAmount)===cents(source.baseAmount) && cents(line.taxAmount)===cents(source.taxAmount);});
          if (!complete || (original.cancelledByCreditNote && !original.cancelledByCreditNote.equals(doc._id))) throw new ConflictException('La nota no anula exactamente el comprobante original');
          // Serialize fiscal changes on the sale: two tax groups can be cancelled concurrently.
          const sale=await this.sales.findOneAndUpdate({_id:doc.sale,branch:doc.branch,isCancelled:{$ne:true}},{$inc:{__v:1}},{new:true,session}).lean().exec();
          if (!sale) throw new ConflictException('No se encontró la venta activa de este comprobante en la sucursal');
          await this.originals.updateOne({_id:original._id,branch:branchId},{$set:{activeSlot:false,cancelledByCreditNote:doc._id,cancelledAt:new Date(),cancellationReason:doc.reasonDescription},$inc:{creditNoteRevision:1}},{session}).exec();
          const otherActive=await this.originals.exists({sale:doc.sale,branch:doc.branch,activeSlot:true}).session(session);
          if (!otherActive) await this.sales.updateOne({_id:doc.sale,branch:doc.branch},{$set:{voucherType:'NONE'}},{session}).exec();
        }
        saved=this.entity(doc);
      },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'}});
      return saved!;
    } finally {await session.endSession();}
  }
  async artifact(id:string, branchId:string, format:'pdf'|'xml'|'cdr') {
    const field=`${format}Base64`;
    const doc:any=await this.model.findOne({ _id:id, branch:branchId }).select(`+${field}`).lean().exec();
    if (!doc?.[field]) return null;
    const reference=format==='cdr' && doc.summaryDate ? `${doc.issuer.documentNumber}-RC-${doc.summaryDate.replace(/-/g,'')}-${doc.summaryNumber}` : `${doc.issuer.documentNumber}-07-${doc.series}-${String(doc.number).padStart(8,'0')}`;
    return { data:doc[field] as string, filename:`${format==='cdr'?'R-':''}${reference}.${format==='cdr'?'zip':format}` };
  }
}
