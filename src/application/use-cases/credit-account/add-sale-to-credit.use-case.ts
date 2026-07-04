import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { ICreditAccountRepository, CREDIT_ACCOUNT_REPOSITORY } from '../../../domain/repositories/credit-account.repository';

@Injectable()
export class AddSaleToCreditUseCase {
  constructor(
    @Inject(CREDIT_ACCOUNT_REPOSITORY) private readonly creditRepository: ICreditAccountRepository,
  ) {}

  async execute(creditId: string, saleId: string, amount: number) {
    const credit = await this.creditRepository.findById(creditId);
    if (!credit) throw new BadRequestException('Cuenta de crédito no encontrada');
    if (credit.status === 'PAID') throw new BadRequestException('La cuenta de crédito ya está completamente pagada');

    return this.creditRepository.addSale(creditId, saleId, amount);
  }
}
