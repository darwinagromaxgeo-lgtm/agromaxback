import { Injectable, Inject } from '@nestjs/common';
import { IAccountPayableRepository, ACCOUNT_PAYABLE_REPOSITORY } from '../../../domain/repositories/account-payable.repository';

@Injectable()
export class GetAPAlertsUseCase {
  constructor(
    @Inject(ACCOUNT_PAYABLE_REPOSITORY) private readonly apRepository: IAccountPayableRepository,
  ) {}

  async execute(upcomingDays = 3) {
    const [overdue, upcoming, summary] = await Promise.all([
      this.apRepository.findOverdue(),
      this.apRepository.findUpcoming(upcomingDays),
      this.apRepository.getSummary(),
    ]);
    return { overdue, upcoming, summary };
  }
}
