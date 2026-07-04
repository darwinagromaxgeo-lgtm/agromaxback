import { Injectable, Inject } from '@nestjs/common';
import { ICreditAccountRepository, CREDIT_ACCOUNT_REPOSITORY } from '../../../domain/repositories/credit-account.repository';

@Injectable()
export class GetCreditSummaryUseCase {
  constructor(
    @Inject(CREDIT_ACCOUNT_REPOSITORY) private readonly creditRepository: ICreditAccountRepository,
  ) {}

  async execute() {
    const { data: pendingCredits } = await this.creditRepository.findAll({ status: 'PENDING' }, 1, 1000);
    const { data: partialCredits } = await this.creditRepository.findAll({ status: 'PARTIAL' }, 1, 1000);

    const allActive = [...pendingCredits, ...partialCredits];
    const totalPending = allActive.reduce((sum, c) => sum + c.pendingAmount, 0);

    const clientTotals: Record<string, { clientId: string; totalPending: number; count: number }> = {};
    for (const credit of allActive) {
      if (!clientTotals[credit.clientId]) {
        clientTotals[credit.clientId] = { clientId: credit.clientId, totalPending: 0, count: 0 };
      }
      clientTotals[credit.clientId].totalPending += credit.pendingAmount;
      clientTotals[credit.clientId].count += 1;
    }

    const topDebtors = Object.values(clientTotals).sort((a, b) => b.totalPending - a.totalPending).slice(0, 10);

    return {
      totalPending: Math.round(totalPending * 100) / 100,
      activeCredits: allActive.length,
      pendingCount: pendingCredits.length,
      partialCount: partialCredits.length,
      topDebtors,
    };
  }
}
