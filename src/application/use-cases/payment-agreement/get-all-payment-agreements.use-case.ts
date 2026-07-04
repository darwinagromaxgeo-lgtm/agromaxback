import { Injectable, Inject } from '@nestjs/common';
import { IPaymentAgreementRepository, PAYMENT_AGREEMENT_REPOSITORY } from '../../../domain/repositories/payment-agreement.repository';

@Injectable()
export class GetAllPaymentAgreementsUseCase {
  constructor(@Inject(PAYMENT_AGREEMENT_REPOSITORY) private readonly repo: IPaymentAgreementRepository) {}

  async execute(filter?: { supplier?: string; status?: string }) {
    return this.repo.findAll(filter);
  }
}
