import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { IPaymentAgreementRepository, PAYMENT_AGREEMENT_REPOSITORY } from '../../../domain/repositories/payment-agreement.repository';

@Injectable()
export class GetPaymentAgreementByIdUseCase {
  constructor(@Inject(PAYMENT_AGREEMENT_REPOSITORY) private readonly repo: IPaymentAgreementRepository) {}

  async execute(id: string) {
    const ag = await this.repo.findById(id);
    if (!ag) throw new NotFoundException('Acuerdo de pago no encontrado');
    return ag;
  }
}
