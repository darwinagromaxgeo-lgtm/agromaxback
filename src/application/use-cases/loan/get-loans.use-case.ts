import { Injectable, Inject } from '@nestjs/common';
import { ILoanRepository, LOAN_REPOSITORY } from '../../../domain/repositories/loan.repository';
import { FilterLoanDto } from '../../dtos/loan/filter-loan.dto';

@Injectable()
export class GetLoansUseCase {
  constructor(
    @Inject(LOAN_REPOSITORY) private readonly loanRepository: ILoanRepository,
  ) {}

  async execute(filter: FilterLoanDto) {
    return this.loanRepository.findAll(
      {
        borrowerName: filter.borrowerName,
        status: filter.status,
        startDate: filter.startDate ? new Date(filter.startDate + 'T00:00:00.000-05:00') : undefined,
        endDate: filter.endDate ? new Date(filter.endDate + 'T23:59:59.999-05:00') : undefined,
      },
      filter.page,
      filter.limit,
    );
  }
}
