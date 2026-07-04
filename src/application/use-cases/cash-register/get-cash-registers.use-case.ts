import { Injectable, Inject } from '@nestjs/common';
import { ICashRegisterRepository, CASH_REGISTER_REPOSITORY } from '../../../domain/repositories/cash-register.repository';
import { FilterCashRegisterDto } from '../../dtos/cash-register/filter-cash-register.dto';

@Injectable()
export class GetCashRegistersUseCase {
  constructor(
    @Inject(CASH_REGISTER_REPOSITORY) private readonly cashRegisterRepository: ICashRegisterRepository,
  ) {}

  async execute(filter: FilterCashRegisterDto) {
    return this.cashRegisterRepository.findAll(
      { startDate: filter.startDate, endDate: filter.endDate, status: filter.status },
      filter.page,
      filter.limit,
    );
  }
}
