import { Injectable, Inject } from '@nestjs/common';
import { ICashRegisterRepository, CASH_REGISTER_REPOSITORY } from '../../../domain/repositories/cash-register.repository';

@Injectable()
export class GetCashRegisterByDateUseCase {
  constructor(
    @Inject(CASH_REGISTER_REPOSITORY) private readonly cashRegisterRepository: ICashRegisterRepository,
  ) {}

  async execute(date: string) {
    return this.cashRegisterRepository.findByDate(date);
  }
}
