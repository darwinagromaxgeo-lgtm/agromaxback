import { Injectable, Inject } from '@nestjs/common';
import { IAccountPayableRepository, ACCOUNT_PAYABLE_REPOSITORY } from '../../../domain/repositories/account-payable.repository';
import { FilterAccountPayableDto } from '../../dtos/account-payable/filter-account-payable.dto';

@Injectable()
export class GetAllAccountsPayableUseCase {
  constructor(
    @Inject(ACCOUNT_PAYABLE_REPOSITORY) private readonly apRepository: IAccountPayableRepository,
  ) {}

  async execute(filter: FilterAccountPayableDto) {
    return this.apRepository.findAll(
      { supplier: filter.supplier, status: filter.status },
      filter.page,
      filter.limit,
    );
  }
}
