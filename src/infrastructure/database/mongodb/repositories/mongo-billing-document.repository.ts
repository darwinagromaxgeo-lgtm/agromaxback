import { ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BillingDocumentEntity, BillingPartySnapshot, BillingSubmissionResult, BillingTaxType } from '../../../../domain/entities/billing-document.entity';
import { BillingDocumentFilter, IBillingDocumentRepository } from '../../../../domain/repositories/billing-document.repository';
import { BillingCounter, BillingCounterDoc, BillingDocument, BillingDocumentDoc } from '../schemas/billing-document.schema';

@Injectable()
export class MongoBillingDocumentRepository implements IBillingDocumentRepository, OnModuleInit {
  constructor(
    @InjectModel(BillingDocument.name) private readonly model: Model<BillingDocumentDoc>,
    @InjectModel(BillingCounter.name) private readonly counters: Model<BillingCounterDoc>,
  ) {}

  async onModuleInit() {
    await Promise.all([this.model.init(), this.counters.init()]);
  }

  async findAll(filter: BillingDocumentFilter, page: number, limit: number) {
    const query: Record<string, unknown> = { branch: new Types.ObjectId(filter.branchId) };
    if (filter.companyId) query.company = new Types.ObjectId(filter.companyId);
    if (filter.saleId) query.sale = new Types.ObjectId(filter.saleId);
    if (filter.saleIds) query.sale = { $in: filter.saleIds.map(id => new Types.ObjectId(id)) };
    if (filter.documentType) query.documentType = filter.documentType;
    if (filter.status) query.status = filter.status;
    if (filter.startDate || filter.endDate) {
      query.createdAt = {
        ...(filter.startDate ? { $gte: filter.startDate } : {}),
        ...(filter.endDate ? { $lte: filter.endDate } : {}),
      };
    }
    const [documents, total] = await Promise.all([
      this.model.find(query).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean().exec(),
      this.model.countDocuments(query).exec(),
    ]);
    return { data: documents.map(document => this.toEntity(document)), total };
  }

  async findById(id: string, branchId: string) {
    const document = await this.model.findOne({ _id: id, branch: branchId }).lean().exec();
    return document ? this.toEntity(document) : null;
  }

  async findForSale(saleId: string, companyId: string, taxType: BillingTaxType, branchId: string) {
    const document = await this.model.findOne({ sale: saleId, company: companyId, taxType, branch: branchId, activeSlot: true }).lean().exec();
    return document ? this.toEntity(document) : null;
  }

  async findCancelledForSale(saleId:string,companyId:string,taxType:BillingTaxType,branchId:string) {
    const document=await this.model.findOne({sale:saleId,company:companyId,taxType,branch:branchId,cancelledByCreditNote:{$exists:true}}).sort({cancelledAt:-1}).lean().exec();
    return document ? this.toEntity(document) : null;
  }

  async hasSubmittedSale(saleId: string) {
    return !!await this.model.exists({ sale: saleId, status: { $in: ['SENDING', 'PENDING', 'ACCEPTED', 'UNKNOWN'] } });
  }

  async hasActiveSale(saleId: string) {
    return !!await this.model.exists({ sale: saleId, activeSlot: true });
  }

  async createDraft(document: BillingDocumentEntity) {
    if (document.replacesDocumentId) return this.createReissue(document);
    const { id, branchId, companyId, saleId, ...data } = document;
    const saved = await this.model.create({ ...data, branch: branchId, company: companyId, sale: saleId });
    return this.toEntity(saved.toObject());
  }

  private async createReissue(document:BillingDocumentEntity) {
    const session=await this.model.db.startSession();
    let saved:BillingDocumentEntity;
    try {
      await session.withTransaction(async()=>{
        const original:any=await this.model.findOneAndUpdate({_id:document.replacesDocumentId,branch:document.branchId,status:'ACCEPTED',activeSlot:false,cancelledByCreditNote:{$exists:true}},{$inc:{reissueRevision:1}},{new:true,session}).lean().exec();
        if (!original || !original.cancelledByCreditNote.equals(document.reissueAfterCreditNoteId) || original.sale.toString()!==document.saleId || original.company.toString()!==document.companyId || original.taxType!==document.taxType) throw new ConflictException('La nueva emisión requiere la anulación aceptada del comprobante original');
        if (original.replacementDocument) {
          const replacement=await this.model.findOne({_id:original.replacementDocument,branch:document.branchId}).session(session).lean().exec();
          if (replacement && replacement.status!=='DISCARDED') {saved=this.toEntity(replacement);return;}
        }
        const {id,branchId,companyId,saleId,replacesDocumentId,reissueAfterCreditNoteId,...data}=document;
        const created=await this.model.create([{...data,branch:branchId,company:companyId,sale:saleId,replacesDocument:replacesDocumentId,reissueCreditNote:reissueAfterCreditNoteId}],{session});
        await this.model.updateOne({_id:original._id,branch:branchId},{$set:{replacementDocument:created[0]._id}},{session}).exec();
        saved=this.toEntity(created[0].toObject());
      },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'}});
      return saved!;
    } finally {await session.endSession();}
  }

  async discard(id: string, branchId: string, reason: string, userId: string) {
    const document = await this.model.findOneAndUpdate(
      { _id: id, branch: branchId, status: 'DRAFT' },
      { $set: { status: 'DISCARDED', activeSlot: false, discardedBy: userId, discardedAt: new Date(), discardReason: reason } },
      { new: true, runValidators: true },
    ).lean().exec();
    return document ? this.toEntity(document) : null;
  }

  private receiverRevisionFilter(revision: number) {
    return revision === 0 ? { $or: [{ receiverRevision: 0 }, { receiverRevision: { $exists: false } }] } : { receiverRevision: revision };
  }

  async updateReceiver(id: string, branchId: string, receiver: BillingPartySnapshot, userId: string, expectedRevision: number) {
    const document = await this.model.findOneAndUpdate(
      { _id: id, branch: branchId, status: 'DRAFT', ...this.receiverRevisionFilter(expectedRevision) },
      { $set: { receiver, receiverUpdatedBy: userId, receiverUpdatedAt: new Date() }, $inc: { receiverRevision: 1 } },
      { new: true, runValidators: true },
    ).lean().exec();
    return document ? this.toEntity(document) : null;
  }

  async claimDraft(id: string, branchId: string, userId: string, receiverRevision?: number) {
    const document = await this.model.findOneAndUpdate(
      { _id: id, branch: branchId, status: 'DRAFT', ...(receiverRevision === undefined ? {} : this.receiverRevisionFilter(receiverRevision)) },
      { $set: { status: 'SENDING', submittedBy: userId, submittedAt: new Date() } },
      { new: true, runValidators: true },
    ).lean().exec();
    return document ? this.toEntity(document) : null;
  }

  async reserveNumber(issuerRuc: string, series: string, environment: string, startNumber: number, maxNumber = 99_999_999) {
    const key = { issuerRuc, series, environment };
    try {
      await this.counters.updateOne(key, { $setOnInsert: { ...key, sequence: startNumber - 1 } }, { upsert: true }).exec();
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
    }
    const counter = await this.counters.findOneAndUpdate(
      { ...key, sequence: { $lt: maxNumber } },
      { $inc: { sequence: 1 } },
      { new: true },
    ).lean().exec();
    if (!counter) throw new Error('Serie de facturación agotada');
    return counter.sequence;
  }

  async setSubmission(id: string, branchId: string, data: Pick<BillingDocumentEntity, 'series' | 'number' | 'environment' | 'issuer' | 'summaryNumber' | 'summaryDate' | 'boletaSubmissionMode'>) {
    const result = await this.model.updateOne({ _id: id, branch: branchId, status: 'SENDING' }, { $set: data }).exec();
    if (result.matchedCount !== 1) throw new Error('El comprobante ya no está en proceso de envío');
  }

  async saveSubmissionResult(id: string, branchId: string, result: BillingSubmissionResult) {
    const document = await this.model.findOneAndUpdate(
      { _id: id, branch: branchId, status: { $in: ['SENDING', 'PENDING'] } },
      { $set: {
        ...result,
        ...(result.pdfBase64 ? { hasPdf: true } : {}),
        ...(result.xmlBase64 ? { hasXml: true } : {}),
        ...(result.cdrBase64 ? { hasCdr: true } : {}),
      } },
      { new: true, runValidators: true },
    ).lean().exec();
    if (!document) throw new Error('No se pudo guardar la respuesta del comprobante');
    return this.toEntity(document);
  }

  async getArtifact(id: string, branchId: string, format: 'pdf' | 'xml' | 'cdr') {
    const field = `${format}Base64`;
    const document: any = await this.model.findOne({ _id: id, branch: branchId }).select(`+${field}`).lean().exec();
    if (!document?.[field]) return null;
    const suffix = format === 'cdr' ? 'zip' : format;
    const prefix = format === 'cdr' ? 'R-' : '';
    const reference = format === 'cdr' && document.documentType === 'BOLETA' && document.summaryDate
      ? `${document.issuer.documentNumber}-RC-${document.summaryDate.replace(/-/g, '')}-${document.summaryNumber}`
      : `${document.issuer.documentNumber}-${document.documentType === 'FACTURA' ? '01' : '03'}-${document.series}-${String(document.number).padStart(8, '0')}`;
    return {
      data: document[field] as string,
      filename: `${prefix}${reference}.${suffix}`,
    };
  }

  private toEntity(document: any): BillingDocumentEntity {
    const { _id, branch, company, sale, __v, activeSlot, pdfBase64, xmlBase64, cdrBase64, cancelledByCreditNote, replacesDocument, reissueCreditNote, replacementDocument, creditNoteRevision, reissueRevision, ...data } = document;
    return {
      ...data,
      id: _id.toString(),
      branchId: branch.toString(),
      companyId: company.toString(),
      saleId: sale.toString(),
      cancelledByCreditNoteId:cancelledByCreditNote?.toString(),
      replacesDocumentId:replacesDocument?.toString(),
      reissueAfterCreditNoteId:reissueCreditNote?.toString(),
      replacementDocumentId:replacementDocument?.toString(),
      createdBy: data.createdBy?.toString(),
      discardedBy: data.discardedBy?.toString(),
      submittedBy: data.submittedBy?.toString(),
      receiverRevision: data.receiverRevision ?? 0,
      receiverUpdatedBy: data.receiverUpdatedBy?.toString(),
    };
  }
}
