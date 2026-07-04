import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { IPaymentAgreementRepository, PAYMENT_AGREEMENT_REPOSITORY } from '../../../domain/repositories/payment-agreement.repository';
import { IAccountPayableRepository, ACCOUNT_PAYABLE_REPOSITORY } from '../../../domain/repositories/account-payable.repository';
import { CreatePaymentAgreementDto } from '../../dtos/payment-agreement/create-payment-agreement.dto';

@Injectable()
export class CreatePaymentAgreementUseCase {
  constructor(
    @Inject(PAYMENT_AGREEMENT_REPOSITORY) private readonly repo: IPaymentAgreementRepository,
    @Inject(ACCOUNT_PAYABLE_REPOSITORY) private readonly apRepo: IAccountPayableRepository,
  ) {}

  async execute(dto: CreatePaymentAgreementDto, userId?: string) {
    if (!dto.accountPayableIds || dto.accountPayableIds.length < 2)
      throw new BadRequestException('Se requieren al menos 2 facturas para crear un acuerdo');

    const aps = await Promise.all(dto.accountPayableIds.map(id => this.apRepo.findById(id)));

    for (const ap of aps) {
      if (!ap) throw new BadRequestException('Una o más facturas no fueron encontradas');
      if (ap.status === 'PAID') throw new BadRequestException(`La factura ${ap.purchaseRef || ap.id} ya está pagada`);
      if (ap.status === 'CONSOLIDATED') throw new BadRequestException(`La factura ${ap.purchaseRef || ap.id} ya pertenece a un acuerdo`);
    }

    const suppliers = [...new Set(aps.map(ap => ap!.supplier))];
    if (suppliers.length > 1) throw new BadRequestException('Todas las facturas deben ser del mismo proveedor');

    const totalAmount = Math.round(aps.reduce((s, ap) => s + ap!.pendingAmount, 0) * 100) / 100;

    if (dto.paymentScheduleType === 'SINGLE_DATE' && !dto.dueDate)
      throw new BadRequestException('Se requiere una fecha de vencimiento para pago único');
    if (dto.paymentScheduleType === 'INSTALLMENTS' && (!dto.installments || dto.installments.length === 0))
      throw new BadRequestException('Se requiere al menos una cuota para pago en cuotas');

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const installments = (dto.installments || []).map(i => {
      const due = new Date(i.dueDate);
      const isPast = due < today;
      return {
        amount: i.amount,
        dueDate: due,
        status: isPast ? 'PAID' as const : 'PENDING' as const,
        ...(isPast ? { paidDate: new Date(), paidAmountPen: i.amount } : {}),
      };
    });

    const autoPaid = installments.filter(i => i.status === 'PAID').reduce((s, i) => s + i.amount, 0);
    const paidAmount = Math.round(autoPaid * 100) / 100;
    const pendingAmount = Math.round((totalAmount - paidAmount) * 100) / 100;

    const agreement = await this.repo.create({
      supplier: suppliers[0],
      invoices: aps.map(ap => ({ apId: ap!.id!, purchaseId: ap!.purchaseId, purchaseRef: ap!.purchaseRef, amount: ap!.pendingAmount })),
      totalAmount,
      paidAmount,
      pendingAmount,
      status: pendingAmount <= 0 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'PENDING',
      paymentScheduleType: dto.paymentScheduleType,
      currency: dto.currency || 'PEN',
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      installments,
      payments: [],
      documentType: dto.documentType,
      documentSeries: dto.documentSeries,
      documentNumber: dto.documentNumber,
      remisionGuia: dto.remisionGuia,
      notes: dto.notes,
      createdBy: userId,
    });

    await Promise.all(aps.map(ap => this.apRepo.update(ap!.id!, { status: 'CONSOLIDATED' as any, agreementId: agreement.id })));

    return agreement;
  }
}
