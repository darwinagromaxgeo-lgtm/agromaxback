import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ISaleRepository } from '../../../../domain/repositories/sale.repository';
import { SaleEntity } from '../../../../domain/entities/sale.entity';
import { SaleDocument, SaleDoc, SaleNoteCounterDocument } from '../schemas/sale.schema';
import { getCurrentBranchId } from '../../../../common/branch/branch-context';
import { cancelSaleInTransaction } from '../sale-cancellation';
import { BadRequestException } from '@nestjs/common';

@Injectable()
export class MongoSaleRepository implements ISaleRepository {
  constructor(
    @InjectModel(SaleDocument.name) private readonly saleModel: Model<SaleDoc>,
    @InjectModel(SaleNoteCounterDocument.name) private readonly noteCounters: Model<SaleNoteCounterDocument>,
  ) {}

  async cancel(id: string, reason: string, userId?: string): Promise<SaleEntity | null> {
    const branchId = getCurrentBranchId();
    if (!branchId) throw new BadRequestException('Selecciona la sucursal de la venta');
    await this.saleModel.db.transaction(session => cancelSaleInTransaction(this.saleModel.db.db!, session, id, branchId, reason, userId));
    return this.findById(id, branchId);
  }

  async create(sale: SaleEntity): Promise<SaleEntity> {
    const numbering = sale.branchId ? await this.reserveNoteNumber(sale.branchId) : {};
    const created = await this.saleModel.create({
      ...numbering,
      branch: sale.branchId || undefined,
      company: sale.companyId || undefined,
      client: sale.clientId || undefined,
      items: sale.items.map((i) => ({
        product: i.productId, company: i.companyId, quantity: i.quantity, priceTier: i.priceTier, unitPrice: i.unitPrice, subtotal: i.subtotal,
        productName: i.productName, unit: i.unit, taxType: i.taxType, taxRate: i.taxRate, lotAllocations: i.lotAllocations,
      })),
      total: sale.total,
      voucherType: sale.voucherType || 'NONE',
      isCredit: sale.isCredit || false,
      payments: (sale.payments || []).map((p) => ({
        paymentMethod: p.paymentMethodId || undefined,
        paymentMethodName: p.paymentMethodName,
        amount: p.amount,
      })),
      date: sale.date, createdBy: sale.createdBy || undefined,
    });
    return this.toEntity(created.toObject());
  }

  private async reserveNoteNumber(branchId: string) {
    const branch = await this.saleModel.db.collection('branches').findOne({ _id: new Types.ObjectId(branchId) }, { projection: { billingSeriesCode: 1, code: 1 } });
    const suffix = String(branch?.billingSeriesCode || branch?.code || '00').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 2).padStart(2, '0');
    const counter = await this.noteCounters.findByIdAndUpdate(branchId,
      { $setOnInsert: { series: `NV${suffix}` }, $inc: { sequence: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: false }).lean().exec();
    return { noteSeries: counter.series, noteNumber: counter.sequence, noteNumberedAt: new Date() };
  }

  async ensureNoteNumber(id: string, branchId: string): Promise<SaleEntity | null> {
    this.saleModel.db.base.set('transactionAsyncLocalStorage', true);
    return this.saleModel.db.transaction(async () => {
      const sale = await this.saleModel.findOne({ _id: id, branch: branchId }).lean().exec();
      if (!sale) return null;
      if (sale.noteSeries && sale.noteNumber) return this.toEntity(sale);
      const numbering = await this.reserveNoteNumber(branchId);
      const numbered = await this.saleModel.findOneAndUpdate({ _id: id, branch: branchId, noteNumber: { $exists: false } }, { $set: numbering }, { new: true }).lean().exec();
      if (!numbered) throw new Error('No se pudo conservar el correlativo de la nota de venta');
      return this.toEntity(numbered);
    });
  }

  async findAll(
    filter?: { companyId?: string; clientId?: string; startDate?: Date; endDate?: Date; voucherType?: string },
    page = 1, limit = 20,
  ): Promise<{ data: SaleEntity[]; total: number; totalAmount: number; cancelledCount: number; totalBaseAmount?: number; totalIgv?: number }> {
    const query: any = {};
    if (filter?.companyId) {
      query.$or = [{ company: filter.companyId }, { 'items.company': filter.companyId }];
    }
    if (filter?.clientId) query.client = filter.clientId;
    if (filter?.voucherType) query.voucherType = filter.voucherType;
    if (filter?.startDate || filter?.endDate) {
      query.date = {};
      if (filter.startDate) query.date.$gte = filter.startDate;
      if (filter.endDate) query.date.$lte = filter.endDate;
    }

    // Queries for amounts exclude cancelled sales so totals reflect actual revenue
    const activeQuery = { ...query, isCancelled: { $ne: true } };

    const promises: any[] = [
      this.saleModel.find(query).populate('company').populate('client').populate('items.product').populate('items.company').skip((page - 1) * limit).limit(limit).sort({ date: -1 }).lean().exec(),
      this.saleModel.countDocuments(query).exec(),
      this.saleModel.aggregate([{ $match: activeQuery }, { $group: { _id: null, totalAmount: { $sum: '$total' } } }]).exec(),
      this.saleModel.countDocuments({ ...query, isCancelled: true }).exec(),
    ];

    // For voucher-filtered queries (BOLETA/FACTURA), compute base amount considering IGV
    const isVoucherQuery = filter?.voucherType === 'BOLETA' || filter?.voucherType === 'FACTURA';
    if (isVoucherQuery) {
      promises.push(
        this.saleModel.aggregate([
          { $match: activeQuery },
          { $unwind: '$items' },
          { $lookup: { from: 'products', localField: 'items.product', foreignField: '_id', as: 'productInfo' } },
          { $unwind: { path: '$productInfo', preserveNullAndEmptyArrays: true } },
          { $addFields: {
            baseSubtotal: {
              $cond: {
                if: { $eq: [{ $ifNull: ['$items.taxType', { $ifNull: ['$productInfo.taxType', 'GRAVADO'] }] }, 'GRAVADO'] },
                then: { $round: [{ $divide: ['$items.subtotal', { $add: [1, { $ifNull: ['$items.taxRate', 0.18] }] }] }, 2] },
                else: '$items.subtotal',
              },
            },
          }},
          { $group: { _id: null, totalBaseAmount: { $sum: '$baseSubtotal' }, totalAmount: { $sum: '$items.subtotal' } } },
        ]).exec(),
      );
    }

    const results = await Promise.all(promises);
    const [data, total, amountAgg, cancelledCount] = results;
    const totalAmount = amountAgg[0]?.totalAmount || 0;

    let totalBaseAmount: number | undefined;
    let totalIgv: number | undefined;
    if (isVoucherQuery && results[4]) {
      const baseAgg = results[4];
      totalBaseAmount = Math.round((baseAgg[0]?.totalBaseAmount || 0) * 100) / 100;
      const rawTotal = baseAgg[0]?.totalAmount || 0;
      totalIgv = Math.round((rawTotal - totalBaseAmount) * 100) / 100;
    }

    return { data: data.map((d: any) => this.toEntity(d)), total, totalAmount, cancelledCount, totalBaseAmount, totalIgv };
  }

  async findById(id: string, branchId?: string): Promise<SaleEntity | null> {
    const doc = await this.saleModel.findOne({ _id: id, ...(branchId ? { branch: branchId } : {}) }).populate('company').populate('client').populate('items.product').populate('items.company').lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async update(id: string, data: Partial<SaleEntity>): Promise<SaleEntity | null> {
    const doc = await this.saleModel.findByIdAndUpdate(id, { $set: data }, { new: true }).populate('company').populate('client').populate('items.product').populate('items.company').lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  private toEntity(doc: any): SaleEntity {
    // Retrocompatibility: old docs have paymentMethod field instead of isCredit/payments
    let isCredit = doc.isCredit || false;
    let payments = (doc.payments || []).map((p: any) => ({
      paymentMethodId: p.paymentMethod?._id?.toString() || p.paymentMethod?.toString() || '',
      paymentMethodName: p.paymentMethodName,
      amount: p.amount,
    }));

    if (payments.length === 0 && doc.paymentMethod) {
      if (doc.paymentMethod === 'CREDIT') {
        isCredit = true;
        payments = [];
      } else {
        isCredit = false;
        payments = [{ paymentMethodId: '', paymentMethodName: 'Efectivo', amount: doc.total }];
      }
    }

    return {
      id: doc._id.toString(),
      branchId: doc.branch?._id?.toString() || doc.branch?.toString(),
      noteSeries: doc.noteSeries, noteNumber: doc.noteNumber, noteNumberedAt: doc.noteNumberedAt,
      companyId: doc.company?._id?.toString() || doc.company?.toString(),
      clientId: doc.client?._id?.toString() || doc.client?.toString(),
      items: (doc.items || []).map((i: any) => ({
        productId: i.product?._id?.toString() || i.product?.toString(),
        productName: i.productName || i.product?.name,
        unit: i.unit,
        taxType: i.taxType,
        taxRate: i.taxRate,
        lotAllocations: i.lotAllocations?.map((allocation: any) => ({ lotId: allocation.lotId.toString(), quantity: allocation.quantity })),
        companyId: i.company?._id?.toString() || i.company?.toString(),
        quantity: i.quantity, priceTier: i.priceTier, unitPrice: i.unitPrice, subtotal: i.subtotal,
      })),
      total: doc.total,
      voucherType: doc.voucherType || (doc.hasBoleta ? 'BOLETA' : 'NONE'),
      isCredit,
      payments,
      isCancelled: doc.isCancelled || false,
      cancelledBy: doc.cancelledBy?.toString(),
      cancelledAt: doc.cancelledAt,
      cancelReason: doc.cancelReason,
      date: doc.date, createdBy: doc.createdBy?.toString(), createdAt: doc.createdAt,
    };
  }
}
