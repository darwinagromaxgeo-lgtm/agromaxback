import { Injectable, Inject } from '@nestjs/common';
import { ICreditAccountRepository, CREDIT_ACCOUNT_REPOSITORY } from '../../../domain/repositories/credit-account.repository';

@Injectable()
export class CreateCreditAccountUseCase {
  constructor(
    @Inject(CREDIT_ACCOUNT_REPOSITORY) private readonly creditRepository: ICreditAccountRepository,
  ) {}

  async execute(clientId: string, saleId: string, totalAmount: number, userId?: string, name?: string) {
    return this.creditRepository.create({
      clientId,
      name,
      saleIds: [saleId],
      totalAmount,
      paidAmount: 0,
      pendingAmount: totalAmount,
      status: 'PENDING',
      payments: [],
      createdBy: userId,
    });
  }
}
