import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ICreditAccountRepository } from '../../../../domain/repositories/credit-account.repository';
import { CreditAccountEntity } from '../../../../domain/entities/credit-account.entity';
import { CreditAccountDocument, CreditAccountDoc } from '../schemas/credit-account.schema';
import { SaleDocument, SaleDoc } from '../schemas/sale.schema';

@Injectable()
export class MongoCreditAccountRepository implements ICreditAccountRepository {
  constructor(
    @InjectModel(CreditAccountDocument.name) private readonly model: Model<CreditAccountDoc>,
    @InjectModel(SaleDocument.name) private readonly saleModel: Model<SaleDoc>,
  ) {
    // Drop legacy unique index on 'sale' field left from previous schema
    this.model.collection.dropIndex('sale_1').catch(() => {});
  }

  /**
   * Fetches and attaches fully-populated sale documents (items.product + items.company)
   * to one or more credit account documents in-place.
   * Works around Mongoose's unreliable nested-populate with .lean().
   */
  private async attachSaleDetails(docs: any | any[]): Promise<void> {
    const docArr: any[] = Array.isArray(docs) ? docs : [docs];

    const allSaleRefs: any[] = docArr.flatMap((d: any) =>
      Array.isArray(d.sales) ? d.sales : [],
    );
    if (!allSaleRefs.length) return;

    const saleIds = allSaleRefs.map((s: any) => s?._id || s).filter(Boolean);

    const populatedSales = await this.saleModel
      .find({ _id: { $in: saleIds } })
      .populate({ path: 'items.product', select: 'name' })
      .populate({ path: 'items.company', select: 'name' })
      .lean()
      .exec();

    const saleMap = new Map<string, any>(
      populatedSales.map((s: any) => [s._id.toString(), s]),
    );

    for (const d of docArr) {
      if (Array.isArray(d.sales)) {
        d.sales = d.sales.map((s: any) => {
          const id = (s?._id || s)?.toString();
          return id ? (saleMap.get(id) ?? s) : s;
        });
      }
    }
  }

  async create(credit: CreditAccountEntity): Promise<CreditAccountEntity> {
    const created = await this.model.create({
      client: credit.clientId,
      name: credit.name,
      sales: credit.saleIds || [],
      totalAmount: credit.totalAmount,
      paidAmount: credit.paidAmount,
      pendingAmount: credit.pendingAmount,
      status: credit.status,
      payments: [],
      createdBy: credit.createdBy || undefined,
    });
    return this.toEntity(created.toObject());
  }

  async findById(id: string): Promise<CreditAccountEntity | null> {
    const doc = await this.model
      .findById(id)
      .populate('client')
      .populate('payments.receivedBy')
      .lean()
      .exec();
    if (!doc) return null;
    await this.attachSaleDetails(doc);
    return this.toEntity(doc);
  }

  async findBySaleId(saleId: string): Promise<CreditAccountEntity | null> {
    const doc = await this.model
      .findOne({ sales: saleId })
      .populate('client')
      .populate('payments.receivedBy')
      .lean()
      .exec();
    if (!doc) return null;
    await this.attachSaleDetails(doc);
    return this.toEntity(doc);
  }

  async findByClientId(clientId: string, page = 1, limit = 20): Promise<{ data: CreditAccountEntity[]; total: number }> {
    const query = { client: clientId };
    const [data, total] = await Promise.all([
      this.model
        .find(query)
        .populate('client')
        .populate('payments.receivedBy')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 })
        .lean()
        .exec(),
      this.model.countDocuments(query).exec(),
    ]);
    await this.attachSaleDetails(data);
    return { data: data.map((d) => this.toEntity(d)), total };
  }

  async findOpenByClientId(clientId: string): Promise<CreditAccountEntity[]> {
    const docs = await this.model
      .find({ client: clientId, status: { $in: ['PENDING', 'PARTIAL'] } })
      .populate('client')
      .lean()
      .exec();
    return docs.map((d) => this.toEntity(d));
  }

  async findAll(filter?: { clientId?: string; status?: string }, page = 1, limit = 20): Promise<{ data: CreditAccountEntity[]; total: number }> {
    const query: any = {};
    if (filter?.clientId) query.client = filter.clientId;
    if (filter?.status) query.status = filter.status;
    const [data, total] = await Promise.all([
      this.model
        .find(query)
        .populate('client')
        .populate('payments.receivedBy')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 })
        .lean()
        .exec(),
      this.model.countDocuments(query).exec(),
    ]);
    await this.attachSaleDetails(data);
    return { data: data.map((d) => this.toEntity(d)), total };
  }

  async update(id: string, data: Partial<CreditAccountEntity>): Promise<CreditAccountEntity | null> {
    const doc = await this.model
      .findByIdAndUpdate(id, { $set: data }, { new: true })
      .populate('client')
      .populate('payments.receivedBy')
      .lean()
      .exec();
    if (!doc) return null;
    await this.attachSaleDetails(doc);
    return this.toEntity(doc);
  }

  async addPayment(id: string, payment: any): Promise<CreditAccountEntity | null> {
    const doc = await this.model
      .findByIdAndUpdate(id, { $push: { payments: payment } }, { new: true })
      .populate('client')
      .populate('payments.receivedBy')
      .lean()
      .exec();
    if (!doc) return null;
    await this.attachSaleDetails(doc);
    return this.toEntity(doc);
  }

  async addSale(id: string, saleId: string, amount: number): Promise<CreditAccountEntity | null> {
    const credit = await this.model.findById(id).lean().exec();
    if (!credit) return null;
    const newTotal = Math.round((credit.totalAmount + amount) * 100) / 100;
    const newPending = Math.round((credit.pendingAmount + amount) * 100) / 100;
    const newStatus = credit.paidAmount > 0 ? 'PARTIAL' : 'PENDING';
    const doc = await this.model
      .findByIdAndUpdate(
        id,
        { $push: { sales: saleId }, $set: { totalAmount: newTotal, pendingAmount: newPending, status: newStatus } },
        { new: true },
      )
      .populate('client')
      .populate('payments.receivedBy')
      .lean()
      .exec();
    if (!doc) return null;
    await this.attachSaleDetails(doc);
    return this.toEntity(doc);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.model.findByIdAndDelete(id).exec();
    return !!result;
  }

  private toEntity(doc: any): CreditAccountEntity {
    const salesArr: any[] = Array.isArray(doc.sales) ? doc.sales : [];
    return {
      id: doc._id.toString(),
      clientId: doc.client?._id?.toString() || doc.client?.toString(),
      name: doc.name,
      saleIds: salesArr.map((s: any) => (s?._id?.toString() || s?.toString())),
      saleDetails: salesArr
        .filter((s: any) => s?.items)
        .map((s: any) => ({
          saleId: s._id.toString(),
          date: s.date,
          total: s.total,
          items: (s.items || []).map((i: any) => ({
            productName: i.product?.name || 'Producto eliminado',
            companyName: i.company?.name || 'N/A',
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            subtotal: i.subtotal,
          })),
        })),
      totalAmount: doc.totalAmount,
      paidAmount: doc.paidAmount,
      pendingAmount: doc.pendingAmount,
      status: doc.status,
      payments: (doc.payments || []).map((p: any) => ({
        id: p._id?.toString(),
        amount: p.amount,
        paymentDate: p.paymentDate,
        paymentMethodId: p.paymentMethod?.toString(),
        paymentMethodName: p.paymentMethodName,
        cashRegisterEntryId: p.cashRegisterEntryId?.toString(),
        notes: p.notes,
        receivedBy: p.receivedBy?._id?.toString() || p.receivedBy?.toString(),
        receivedByName: p.receivedBy?.name,
      })),
      createdBy: doc.createdBy?.toString(),
      createdAt: doc.createdAt,
    };
  }
}
