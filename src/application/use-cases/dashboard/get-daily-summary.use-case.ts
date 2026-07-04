import { Injectable, Inject } from '@nestjs/common';
import { ICashRegisterRepository, CASH_REGISTER_REPOSITORY } from '../../../domain/repositories/cash-register.repository';

@Injectable()
export class GetDailySummaryUseCase {
  constructor(
    @Inject(CASH_REGISTER_REPOSITORY) private readonly cashRegisterRepository: ICashRegisterRepository,
  ) {}

  private getPeruDate(): Date {
    const now = new Date();
    return new Date(now.toLocaleString('en-US', { timeZone: 'America/Lima' }));
  }

  async execute(period: string = 'daily') {
    const today = this.getPeruDate();
    const pad = (n: number) => String(n).padStart(2, '0');
    let startDate: string;
    const endDate = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    if (period === 'weekly') {
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      startDate = `${weekAgo.getFullYear()}-${pad(weekAgo.getMonth() + 1)}-${pad(weekAgo.getDate())}`;
    } else if (period === 'monthly') {
      const monthAgo = new Date(today);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      startDate = `${monthAgo.getFullYear()}-${pad(monthAgo.getMonth() + 1)}-${pad(monthAgo.getDate())}`;
    } else {
      startDate = endDate;
    }

    const { data: registers } = await this.cashRegisterRepository.findAll({ startDate, endDate }, 1, 100);

    let totalIncome = 0;
    let totalExpense = 0;

    for (const register of registers) {
      const active = register.entries.filter(e => !e.isDeleted);
      totalIncome += active.filter(e => e.type === 'INCOME').reduce((s, e) => s + e.amount, 0);
      totalExpense += active.filter(e => e.type === 'EXPENSE').reduce((s, e) => s + e.amount, 0);
    }

    return {
      period,
      startDate,
      endDate,
      totalIncome: Math.round(totalIncome * 100) / 100,
      totalExpense: Math.round(totalExpense * 100) / 100,
      netProfit: Math.round((totalIncome - totalExpense) * 100) / 100,
      registersCount: registers.length,
    };
  }
}
