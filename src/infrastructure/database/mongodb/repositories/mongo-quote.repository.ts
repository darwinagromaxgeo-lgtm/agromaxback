import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IQuoteRepository } from '../../../../domain/repositories/quote.repository';
import { QuoteEntity, QuoteStatus } from '../../../../domain/entities/quote.entity';
import { QuoteDocument, QuoteDoc, QuoteCounterDocument, QuoteCounterDoc } from '../schemas/quote.schema';

@Injectable()
export class MongoQuoteRepository implements IQuoteRepository {
  constructor(
    @InjectModel(QuoteDocument.name) private readonly quoteModel: Model<QuoteDoc>,
    @InjectModel(QuoteCounterDocument.name) private readonly counterModel: Model<QuoteCounterDoc>,
  ) {}

  async nextSequence(series: string, branchId: string): Promise<number> {
    const doc = await this.counterModel.findOneAndUpdate(
      { series, branch: new Types.ObjectId(branchId) },
      { $inc: { seq: 1 } },
      { new: true, upsert: true },
    ).lean().exec();
    return doc!.seq;
  }

  async create(quote: QuoteEntity): Promise<QuoteEntity> {
    const created = await this.quoteModel.create({
      series: quote.series,
      number: quote.number,
      quoteNumber: quote.quoteNumber,
      company: quote.companyId ? new Types.ObjectId(quote.companyId) : undefined,
      client: quote.clientId ? new Types.ObjectId(quote.clientId) : undefined,
      clientName: quote.clientName,
      items: quote.items.map(i => ({
        product: new Types.ObjectId(i.productId),
        company: new Types.ObjectId(i.companyId),
        quantity: i.quantity,
        priceTier: i.priceTier,
        unitPrice: i.unitPrice,
        subtotal: i.subtotal,
      })),
      total: quote.total,
      notes: quote.notes,
      status: quote.status,
      issueDate: quote.issueDate,
      validUntil: quote.validUntil,
      createdBy: quote.createdBy ? new Types.ObjectId(quote.createdBy) : undefined,
      branch: quote.branchId ? new Types.ObjectId(quote.branchId) : undefined,
    });
    return this.toEntity(created.toObject());
  }

  async findAll(
    filter?: { branchId?: string; status?: QuoteStatus; clientId?: string; startDate?: Date; endDate?: Date },
    page = 1, limit = 20,
  ): Promise<{ data: QuoteEntity[]; total: number }> {
    const query: any = {};
    if (filter?.branchId) query.branch = new Types.ObjectId(filter.branchId);
    if (filter?.status) query.status = filter.status;
    if (filter?.clientId) query.client = new Types.ObjectId(filter.clientId);
    if (filter?.startDate || filter?.endDate) {
      query.issueDate = {};
      if (filter.startDate) query.issueDate.$gte = filter.startDate;
      if (filter.endDate) query.issueDate.$lte = filter.endDate;
    }
    const [data, total] = await Promise.all([
      this.quoteModel.find(query).populate('items.product').populate('client').populate('createdBy', 'fullName email').sort({ issueDate: -1 }).skip((page - 1) * limit).limit(limit).lean().exec(),
      this.quoteModel.countDocuments(query).exec(),
    ]);
    return { data: data.map((d) => this.toEntity(d)), total };
  }

  async findById(id: string, branchId?: string): Promise<QuoteEntity | null> {
    const query: any = { _id: id };
    if (branchId) query.branch = new Types.ObjectId(branchId);
    const doc = await this.quoteModel.findOne(query).populate('items.product').populate('client').populate('createdBy', 'fullName email').lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async updateStatus(id: string, status: QuoteStatus, convertedSaleId?: string, branchId?: string): Promise<QuoteEntity | null> {
    const update: any = { status };
    if (convertedSaleId) update.convertedSaleId = new Types.ObjectId(convertedSaleId);
    const query: any = { _id: id };
    if (branchId) query.branch = new Types.ObjectId(branchId);
    const doc = await this.quoteModel.findOneAndUpdate(query, update, { new: true }).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  private toEntity(doc: any): QuoteEntity {
    return {
      id: doc._id.toString(),
      branchId: doc.branch?.toString(),
      series: doc.series,
      number: doc.number,
      quoteNumber: doc.quoteNumber,
      companyId: doc.company?._id?.toString() || doc.company?.toString(),
      clientId: doc.client?._id?.toString() || doc.client?.toString(),
      clientName: doc.clientName || doc.client?.name,
      clientDetails: doc.client?.name ? { name: doc.client.name, documentNumber: doc.client.documentNumber, address: doc.client.address, phone: doc.client.phone, email: doc.client.email } : undefined,
      createdByName: doc.createdBy?.fullName, createdByEmail: doc.createdBy?.email,
      items: (doc.items || []).map((i: any) => ({
        productId: i.product?._id?.toString() || i.product?.toString(),
        companyId: i.company?.toString(),
        billingEnabled: i.product?.billingEnabled !== false,
        productName: i.productName || i.product?.name, unit: i.unit || i.product?.unit, taxType: i.taxType || i.product?.taxType, taxRate: i.taxRate,
        quantity: i.quantity,
        priceTier: i.priceTier,
        unitPrice: i.unitPrice,
        subtotal: i.subtotal,
      })),
      total: doc.total,
      notes: doc.notes,
      status: doc.status,
      issueDate: doc.issueDate,
      validUntil: doc.validUntil,
      convertedSaleId: doc.convertedSaleId?.toString(),
      createdBy: doc.createdBy?._id?.toString() || doc.createdBy?.toString(),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
