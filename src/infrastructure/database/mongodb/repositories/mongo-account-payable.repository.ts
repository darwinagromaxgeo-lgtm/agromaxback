import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IAccountPayableRepository } from '../../../../domain/repositories/account-payable.repository';
import { AccountPayableEntity } from '../../../../domain/entities/account-payable.entity';
import { AccountPayableDocument, AccountPayableDoc } from '../schemas/account-payable.schema';
import { getNowInTimezone } from '../../../../shared/utils/date.util';

@Injectable()
export class MongoAccountPayableRepository implements IAccountPayableRepository {
  constructor(
    @InjectModel(AccountPayableDocument.name) private readonly model: Model<AccountPayableDoc>,
  ) {}

  async create(ap: AccountPayableEntity): Promise<AccountPayableEntity> {
    const created = await this.model.create({
      purchase: ap.purchaseId,
      supplier: ap.supplier,
      totalAmount: ap.totalAmount,
      paidAmount: ap.paidAmount,
      pendingAmount: ap.pendingAmount,
      status: ap.status,
      paymentScheduleType: ap.paymentScheduleType,
      dueDate: ap.dueDate,
      installments: (ap.installments || []).map(i => ({
        amount: i.amount, dueDate: i.dueDate, status: i.status || 'PENDING',
      })),
      payments: [],
      currency: ap.currency || 'PEN',
      totalAmountPen: ap.totalAmountPen,
      createdBy: ap.createdBy || undefined,
    });
    return this.toEntity(created.toObject());
  }

  async findById(id: string): Promise<AccountPayableEntity | null> {
    const doc = await this.model.findById(id)
      .populate({ path: 'purchase', populate: [{ path: 'items.product' }, { path: 'company' }] })
      .populate('payments.registeredBy')
      .lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findByPurchaseId(purchaseId: string): Promise<AccountPayableEntity | null> {
    const doc = await this.model.findOne({ purchase: purchaseId })
      .populate({ path: 'purchase', populate: [{ path: 'items.product' }, { path: 'company' }] })
      .populate('payments.registeredBy')
      .lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findAll(filter?: { supplier?: string; status?: string }, page = 1, limit = 20): Promise<{ data: AccountPayableEntity[]; total: number }> {
    const query: any = {};
    if (filter?.supplier) query.supplier = { $regex: filter.supplier, $options: 'i' };
    if (filter?.status) query.status = filter.status;
    const [data, total] = await Promise.all([
      this.model.find(query)
        .populate({ path: 'purchase', populate: [{ path: 'items.product' }, { path: 'company' }] })
        .populate('payments.registeredBy')
        .skip((page - 1) * limit).limit(limit).sort({ createdAt: -1 }).lean().exec(),
      this.model.countDocuments(query).exec(),
    ]);
    return { data: data.map(d => this.toEntity(d)), total };
  }

  async update(id: string, data: Partial<AccountPayableEntity>): Promise<AccountPayableEntity | null> {
    const updateData: any = {};
    if (data.paidAmount !== undefined) updateData.paidAmount = data.paidAmount;
    if (data.pendingAmount !== undefined) updateData.pendingAmount = data.pendingAmount;
    if (data.totalAmount !== undefined) updateData.totalAmount = data.totalAmount;
    if (data.totalAmountPen !== undefined) updateData.totalAmountPen = data.totalAmountPen;
    if (data.status) updateData.status = data.status;
    if (data.installments !== undefined) updateData.installments = data.installments;
    if (data.paymentScheduleType !== undefined) updateData.paymentScheduleType = data.paymentScheduleType;
    if ('dueDate' in data) updateData.dueDate = data.dueDate ?? null;
    if (data.currency !== undefined) updateData.currency = data.currency;
    if ('agreementId' in data) updateData.agreementId = data.agreementId ?? null;
    const doc = await this.model.findByIdAndUpdate(id, { $set: updateData }, { new: true })
      .populate({ path: 'purchase', populate: [{ path: 'items.product' }, { path: 'company' }] })
      .populate('payments.registeredBy')
      .lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async delete(id: string): Promise<void> {
    await this.model.findByIdAndDelete(id).exec();
  }

  async setPaymentVoucher(apId: string, paymentId: string, voucherUrl: string): Promise<void> {
    await this.model.findByIdAndUpdate(
      apId,
      { $set: { 'payments.$[elem].voucherUrl': voucherUrl } },
      { arrayFilters: [{ 'elem._id': new (require('mongoose').Types.ObjectId)(paymentId) }] }
    ).exec();
  }

  async addPayment(id: string, payment: any): Promise<AccountPayableEntity | null> {
    const doc = await this.model.findByIdAndUpdate(id, { $push: { payments: payment } }, { new: true })
      .populate({ path: 'purchase', populate: [{ path: 'items.product' }, { path: 'company' }] })
      .populate('payments.registeredBy')
      .lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findUpcoming(days: number): Promise<AccountPayableEntity[]> {
    const now = getNowInTimezone();
    const futureDate = new Date(now);
    futureDate.setDate(futureDate.getDate() + days);

    const docs = await this.model.find({
      status: { $in: ['PENDING', 'PARTIAL'] },
      $or: [
        { paymentScheduleType: 'SINGLE_DATE', dueDate: { $gte: now, $lte: futureDate } },
        { paymentScheduleType: 'INSTALLMENTS', installments: { $elemMatch: { status: 'PENDING', dueDate: { $gte: now, $lte: futureDate } } } },
      ],
    }).populate({ path: 'purchase', populate: [{ path: 'items.product' }, { path: 'company' }] })
      .sort({ dueDate: 1 }).lean().exec();
    return docs.map(d => this.toEntity(d));
  }

  async findOverdue(): Promise<AccountPayableEntity[]> {
    const now = getNowInTimezone();
    const docs = await this.model.find({
      status: { $in: ['PENDING', 'PARTIAL'] },
      $or: [
        { paymentScheduleType: 'SINGLE_DATE', dueDate: { $lt: now } },
        { paymentScheduleType: 'INSTALLMENTS', installments: { $elemMatch: { status: 'PENDING', dueDate: { $lt: now } } } },
      ],
    }).populate({ path: 'purchase', populate: [{ path: 'items.product' }, { path: 'company' }] })
      .sort({ dueDate: 1 }).lean().exec();
    return docs.map(d => this.toEntity(d));
  }

  async getSummary(): Promise<{ totalPending: number; totalOverdue: number; count: number }> {
    const now = getNowInTimezone();
    const [pendingResult, overdueResult] = await Promise.all([
      this.model.aggregate([
        { $match: { status: { $in: ['PENDING', 'PARTIAL'] } } },
        { $group: { _id: null, totalPending: { $sum: '$pendingAmount' }, count: { $sum: 1 } } },
      ]).exec(),
      this.model.aggregate([
        {
          $match: {
            status: { $in: ['PENDING', 'PARTIAL'] },
            $or: [
              { paymentScheduleType: 'SINGLE_DATE', dueDate: { $lt: now } },
              { paymentScheduleType: 'INSTALLMENTS', installments: { $elemMatch: { status: 'PENDING', dueDate: { $lt: now } } } },
            ],
          },
        },
        { $group: { _id: null, totalOverdue: { $sum: '$pendingAmount' } } },
      ]).exec(),
    ]);
    return {
      totalPending: pendingResult[0]?.totalPending || 0,
      totalOverdue: overdueResult[0]?.totalOverdue || 0,
      count: pendingResult[0]?.count || 0,
    };
  }

  private toEntity(doc: any): AccountPayableEntity {
    const purchase = doc.purchase && typeof doc.purchase === 'object' ? doc.purchase : null;
    const purchaseRef = purchase
      ? [purchase.documentSeries, purchase.documentNumber].filter(Boolean).join('-') || undefined
      : undefined;

    return {
      id: doc._id.toString(),
      purchaseId: doc.purchase?._id?.toString() || doc.purchase?.toString(),
      purchaseRef,
      agreementId: doc.agreementId,
      supplier: doc.supplier,
      totalAmount: doc.totalAmount,
      paidAmount: doc.paidAmount,
      pendingAmount: doc.pendingAmount,
      status: doc.status,
      paymentScheduleType: doc.paymentScheduleType,
      dueDate: doc.dueDate,
      installments: (doc.installments || []).map((i: any) => ({
        id: i._id?.toString(),
        amount: i.amount,
        dueDate: i.dueDate,
        status: i.status,
        paidDate: i.paidDate,
      })),
      payments: (doc.payments || []).map((p: any) => ({
        id: p._id?.toString(),
        amount: p.amount,
        paymentDate: p.paymentDate,
        codigoTransferencia: p.codigoTransferencia,
        notes: p.notes,
        registeredBy: p.registeredBy?._id?.toString() || p.registeredBy?.toString(),
        registeredByName: p.registeredBy?.name,
        voucherUrl: p.voucherUrl,
      })),
      currency: doc.currency || 'PEN',
      totalAmountPen: doc.totalAmountPen,
      createdBy: doc.createdBy?.toString(),
      createdAt: doc.createdAt,
    };
  }
}
