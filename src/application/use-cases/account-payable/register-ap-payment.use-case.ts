import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { IAccountPayableRepository, ACCOUNT_PAYABLE_REPOSITORY } from '../../../domain/repositories/account-payable.repository';
import { RegisterAPPaymentDto } from '../../dtos/account-payable/register-ap-payment.dto';

@Injectable()
export class RegisterAPPaymentUseCase {
  constructor(
    @Inject(ACCOUNT_PAYABLE_REPOSITORY) private readonly apRepository: IAccountPayableRepository,
  ) {}

  async execute(apId: string, dto: RegisterAPPaymentDto, userId?: string) {
    const ap = await this.apRepository.findById(apId);
    if (!ap) throw new BadRequestException('Cuenta por pagar no encontrada');
    if (ap.status === 'PAID') throw new BadRequestException('La cuenta ya está completamente pagada');

    // paidAmount and dto.amount are always in PEN (actual payment currency).
    // For USD accounts totalAmountPen holds the PEN equivalent of totalAmount.
    const totalInPen = ap.currency === 'USD' && ap.totalAmountPen
      ? ap.totalAmountPen
      : ap.totalAmount;
    const effectivePending = Math.round((totalInPen - ap.paidAmount) * 100) / 100;

    if (dto.amount > effectivePending + 0.01)
      throw new BadRequestException(`El pago excede el monto pendiente. Máximo: S/ ${effectivePending.toFixed(2)}`);

    await this.apRepository.addPayment(apId, {
      amount: dto.amount,
      paymentDate: new Date(),
      codigoTransferencia: dto.codigoTransferencia,
      notes: dto.notes,
      registeredBy: userId,
    });

    const newPaidAmount = Math.round((ap.paidAmount + dto.amount) * 100) / 100;
    const isFullPayment = dto.isFullPayment === true;
    const newPendingAmount = isFullPayment ? 0 : Math.max(0, Math.round((totalInPen - newPaidAmount) * 100) / 100);
    const newStatus = (isFullPayment || newPendingAmount <= 0.01) ? 'PAID' : 'PARTIAL';

    // Update installment status — for USD accounts convert installment amounts to PEN
    let updatedInstallments = ap.installments;
    if (ap.paymentScheduleType === 'INSTALLMENTS' && ap.installments.length > 0) {
      const exchangeRate = ap.currency === 'USD' && ap.totalAmount > 0 && ap.totalAmountPen
        ? ap.totalAmountPen / ap.totalAmount
        : 1;
      const numeroUnico = dto.codigoTransferencia || undefined;
      if (isFullPayment) {
        updatedInstallments = ap.installments.map(inst =>
          inst.status === 'PENDING'
            ? { ...inst, status: 'PAID' as const, paidDate: new Date(), paidAmountPen: Math.round(inst.amount * exchangeRate * 100) / 100, ...(numeroUnico && { numeroUnico }) }
            : inst
        );
      } else {
        // Mark installments as PAID one by one in order, using the payment amount.
        // Tolerance of 3% covers exchange-rate drift between the stored purchase
        // rate and the current market rate used by the frontend to convert USD→PEN.
        let remaining = dto.amount;
        updatedInstallments = ap.installments.map(inst => {
          if (inst.status !== 'PENDING') return inst;
          const instAmountInPen = Math.round(inst.amount * exchangeRate * 100) / 100;
          const tolerance = Math.max(2, Math.round(instAmountInPen * 0.03 * 100) / 100);
          if (remaining >= instAmountInPen - tolerance) {
            remaining = Math.round((remaining - instAmountInPen) * 100) / 100;
            return { ...inst, status: 'PAID' as const, paidDate: new Date(), paidAmountPen: instAmountInPen, ...(numeroUnico && { numeroUnico }) };
          }
          return inst;
        });
      }
    }

    return this.apRepository.update(apId, {
      paidAmount: newPaidAmount,
      pendingAmount: newPendingAmount,
      status: newStatus,
      installments: updatedInstallments,
    });
  }
}
