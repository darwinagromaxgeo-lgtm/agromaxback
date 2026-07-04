import { Injectable, Inject } from '@nestjs/common';
import { ICreditAccountRepository, CREDIT_ACCOUNT_REPOSITORY } from '../../../domain/repositories/credit-account.repository';
import { FilterCreditDto } from '../../dtos/credit-account/filter-credit.dto';

@Injectable()
export class GetAllCreditsUseCase {
  constructor(
    @Inject(CREDIT_ACCOUNT_REPOSITORY) private readonly creditRepository: ICreditAccountRepository,
  ) {}

  async execute(filter: FilterCreditDto) {
    return this.creditRepository.findAll(
      { clientId: filter.clientId, status: filter.status },
      filter.page,
      filter.limit,
    );
  }
}
