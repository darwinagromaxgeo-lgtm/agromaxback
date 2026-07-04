import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IPaymentAgreementRepository } from '../../../../domain/repositories/payment-agreement.repository';
import { PaymentAgreementEntity } from '../../../../domain/entities/payment-agreement.entity';
import { PaymentAgreementDocument, PaymentAgreementDoc } from '../schemas/payment-agreement.schema';

@Injectable()
export class MongoPaymentAgreementRepository implements IPaymentAgreementRepository {
  constructor(
    @InjectModel(PaymentAgreementDocument.name) private readonly model: Model<PaymentAgreementDoc>,
  ) {}

  async create(entity: PaymentAgreementEntity): Promise<PaymentAgreementEntity> {
    const doc = await this.model.create({
      supplier: entity.supplier,
      invoices: entity.invoices,
      totalAmount: entity.totalAmount,
      paidAmount: entity.paidAmount ?? 0,
      pendingAmount: entity.pendingAmount ?? entity.totalAmount,
      status: entity.status || 'PENDING',
      paymentScheduleType: entity.paymentScheduleType,
      currency: entity.currency || 'PEN',
      dueDate: entity.dueDate,
      installments: (entity.installments || []).map(i => ({
        amount: i.amount, dueDate: i.dueDate, status: i.status || 'PENDING',
        ...(i.paidDate ? { paidDate: i.paidDate } : {}),
      })),
      payments: [],
      documentType: entity.documentType,
      documentSeries: entity.documentSeries,
      documentNumber: entity.documentNumber,
      remisionGuia: entity.remisionGuia,
      notes: entity.notes,
      createdBy: entity.createdBy || undefined,
    });
    return this.toEntity(doc.toObject());
  }

  async findById(id: string): Promise<PaymentAgreementEntity | null> {
    const doc = await this.model.findById(id)
      .populate('payments.registeredBy')
      .lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findAll(filter?: { supplier?: string; status?: string }): Promise<PaymentAgreementEntity[]> {
    const query: any = {};
    if (filter?.supplier) query.supplier = { $regex: filter.supplier, $options: 'i' };
    if (filter?.status) query.status = filter.status;
    const docs = await this.model.find(query).sort({ createdAt: -1 }).lean().exec();
    return docs.map(d => this.toEntity(d));
  }

  async update(id: string, data: Partial<PaymentAgreementEntity>): Promise<PaymentAgreementEntity | null> {
    const updateData: any = {};
    if (data.paidAmount !== undefined) updateData.paidAmount = data.paidAmount;
    if (data.pendingAmount !== undefined) updateData.pendingAmount = data.pendingAmount;
    if (data.status) updateData.status = data.status;
    if (data.installments) updateData.installments = data.installments;
    if (data.cancellationReason !== undefined) updateData.cancellationReason = data.cancellationReason;
    if (data.cancelledBy !== undefined) updateData.cancelledBy = data.cancelledBy;
    if (data.cancelledAt !== undefined) updateData.cancelledAt = data.cancelledAt;
    const doc = await this.model.findByIdAndUpdate(id, { $set: updateData }, { new: true })
      .populate('payments.registeredBy')
      .lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async addPayment(id: string, payment: any): Promise<PaymentAgreementEntity | null> {
    const doc = await this.model.findByIdAndUpdate(id, { $push: { payments: payment } }, { new: true })
      .populate('payments.registeredBy')
      .lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async setPaymentVoucher(agreementId: string, paymentId: string, voucherUrl: string): Promise<void> {
    await this.model.findByIdAndUpdate(
      agreementId,
      { $set: { 'payments.$[elem].voucherUrl': voucherUrl } },
      { arrayFilters: [{ 'elem._id': new Types.ObjectId(paymentId) }] },
    ).exec();
  }

  async setInstallmentVoucher(agreementId: string, installmentId: string, voucherUrl: string): Promise<void> {
    await this.model.findByIdAndUpdate(
      agreementId,
      { $set: { 'installments.$[elem].voucherUrl': voucherUrl } },
      { arrayFilters: [{ 'elem._id': new Types.ObjectId(installmentId) }] },
    ).exec();
  }

  private toEntity(doc: any): PaymentAgreementEntity {
    return {
      id: doc._id.toString(),
      supplier: doc.supplier,
      invoices: (doc.invoices || []).map((i: any) => ({ apId: i.apId, purchaseId: i.purchaseId, purchaseRef: i.purchaseRef, amount: i.amount })),
      totalAmount: doc.totalAmount,
      paidAmount: doc.paidAmount,
      pendingAmount: doc.pendingAmount,
      status: doc.status,
      paymentScheduleType: doc.paymentScheduleType,
      currency: (doc.currency as 'PEN' | 'USD') || 'PEN',
      dueDate: doc.dueDate,
      installments: (doc.installments || []).map((i: any) => ({
        id: i._id?.toString(), amount: i.amount, dueDate: i.dueDate, status: i.status, paidDate: i.paidDate, voucherUrl: i.voucherUrl,
      })),
      payments: (doc.payments || []).map((p: any) => ({
        id: p._id?.toString(), amount: p.amount, paymentDate: p.paymentDate,
        codigoTransferencia: p.codigoTransferencia, notes: p.notes, voucherUrl: p.voucherUrl,
        registeredBy: p.registeredBy?._id?.toString() || p.registeredBy?.toString(),
        registeredByName: p.registeredBy?.name,
      })),
      documentType: doc.documentType as 'FACTURA' | 'BOLETA' | undefined,
      documentSeries: doc.documentSeries,
      documentNumber: doc.documentNumber,
      remisionGuia: doc.remisionGuia ? { serie: doc.remisionGuia.serie, correlativo: doc.remisionGuia.correlativo, fecha: doc.remisionGuia.fecha } : undefined,
      notes: doc.notes,
      cancellationReason: doc.cancellationReason,
      cancelledBy: doc.cancelledBy,
      cancelledAt: doc.cancelledAt,
      createdBy: doc.createdBy?.toString(),
      createdAt: doc.createdAt,
    };
  }
}
