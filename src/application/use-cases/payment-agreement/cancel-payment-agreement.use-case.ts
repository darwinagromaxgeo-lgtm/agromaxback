import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { IPaymentAgreementRepository, PAYMENT_AGREEMENT_REPOSITORY } from '../../../domain/repositories/payment-agreement.repository';
import { IAccountPayableRepository, ACCOUNT_PAYABLE_REPOSITORY } from '../../../domain/repositories/account-payable.repository';
import { CancelAgreementDto } from '../../dtos/payment-agreement/cancel-agreement.dto';

@Injectable()
export class CancelPaymentAgreementUseCase {
  constructor(
    @Inject(PAYMENT_AGREEMENT_REPOSITORY) private readonly repo: IPaymentAgreementRepository,
    @Inject(ACCOUNT_PAYABLE_REPOSITORY) private readonly apRepo: IAccountPayableRepository,
  ) {}

  async execute(agreementId: string, dto: CancelAgreementDto, userId?: string) {
    const ag = await this.repo.findById(agreementId);
    if (!ag) throw new BadRequestException('Acuerdo no encontrado');
    if (ag.status === 'CANCELLED') throw new BadRequestException('El acuerdo ya está anulado');
    if (ag.paidAmount > 0)
      throw new BadRequestException('No se puede anular un acuerdo con pagos registrados');

    await this.repo.update(agreementId, {
      status: 'CANCELLED',
      cancellationReason: dto.reason,
      cancelledBy: userId,
      cancelledAt: new Date(),
    });

    await Promise.all(ag.invoices.map(inv =>
      this.apRepo.update(inv.apId, { status: 'PENDING', agreementId: undefined }),
    ));

    return { message: 'Acuerdo anulado correctamente' };
  }
}
