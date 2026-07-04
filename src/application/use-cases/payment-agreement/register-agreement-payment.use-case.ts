import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { IPaymentAgreementRepository, PAYMENT_AGREEMENT_REPOSITORY } from '../../../domain/repositories/payment-agreement.repository';
import { IAccountPayableRepository, ACCOUNT_PAYABLE_REPOSITORY } from '../../../domain/repositories/account-payable.repository';
import { RegisterAgreementPaymentDto } from '../../dtos/payment-agreement/register-agreement-payment.dto';

@Injectable()
export class RegisterAgreementPaymentUseCase {
  constructor(
    @Inject(PAYMENT_AGREEMENT_REPOSITORY) private readonly repo: IPaymentAgreementRepository,
    @Inject(ACCOUNT_PAYABLE_REPOSITORY) private readonly apRepo: IAccountPayableRepository,
  ) {}

  async execute(agreementId: string, dto: RegisterAgreementPaymentDto, userId?: string) {
    const ag = await this.repo.findById(agreementId);
    if (!ag) throw new BadRequestException('Acuerdo no encontrado');
    if (ag.status === 'CANCELLED') throw new BadRequestException('El acuerdo está anulado');
    if (ag.status === 'PAID') throw new BadRequestException('El acuerdo ya está completamente pagado');
    if (dto.amount > ag.pendingAmount)
      throw new BadRequestException(`El pago excede el monto pendiente. Máximo: ${ag.pendingAmount}`);

    await this.repo.addPayment(agreementId, {
      amount: dto.amount,
      paymentDate: new Date(),
      codigoTransferencia: dto.codigoTransferencia,
      notes: dto.notes,
      registeredBy: userId,
    });

    const newPaidAmount = Math.round((ag.paidAmount + dto.amount) * 100) / 100;
    const newPendingAmount = Math.round((ag.totalAmount - newPaidAmount) * 100) / 100;
    const newStatus = newPendingAmount <= 0 ? 'PAID' : 'PARTIAL';

    let updatedInstallments = ag.installments;
    if (ag.paymentScheduleType === 'INSTALLMENTS' && ag.installments.length > 0) {
      let remaining = dto.amount;
      updatedInstallments = ag.installments.map(inst => {
        if (inst.status === 'PENDING' && remaining >= inst.amount) {
          remaining -= inst.amount;
          return { ...inst, status: 'PAID' as const, paidDate: new Date() };
        }
        return inst;
      });
    }

    const updated = await this.repo.update(agreementId, {
      paidAmount: newPaidAmount,
      pendingAmount: newPendingAmount,
      status: newStatus,
      installments: updatedInstallments,
    });

    if (newStatus === 'PAID') {
      await Promise.all(ag.invoices.map(inv =>
        this.apRepo.update(inv.apId, { status: 'PAID', agreementId: undefined }),
      ));
    }

    return updated;
  }
}
