import { Injectable, Inject } from '@nestjs/common';
import { ISaleRepository, SALE_REPOSITORY } from '../../../domain/repositories/sale.repository';

@Injectable()
export class GetSalesChartUseCase {
  constructor(
    @Inject(SALE_REPOSITORY) private readonly saleRepository: ISaleRepository,
  ) {}

  private toPeruDate(date: Date): Date {
    return new Date(date.toLocaleString('en-US', { timeZone: 'America/Lima' }));
  }

  async execute(startDate?: Date, endDate?: Date) {
    const now = this.toPeruDate(new Date());

    const end = endDate ? this.toPeruDate(endDate) : now;
    const start = startDate ? this.toPeruDate(startDate) : (() => {
      const d = new Date(now);
      d.setDate(d.getDate() - 29);
      return d;
    })();

    const { data: sales } = await this.saleRepository.findAll(
      { startDate: start, endDate: end },
      1,
      2000,
    );

    // Build day range between start and end
    const dailyMap: Record<string, number> = {};
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);
    const endDay = new Date(end);
    endDay.setHours(23, 59, 59, 999);
    while (cursor <= endDay) {
      const key = `${String(cursor.getDate()).padStart(2, '0')}/${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      dailyMap[key] = 0;
      cursor.setDate(cursor.getDate() + 1);
    }

    // Aggregate sales by hour (0-23)
    const hourMap: Record<number, { total: number; count: number }> = {};
    for (let h = 0; h < 24; h++) {
      hourMap[h] = { total: 0, count: 0 };
    }

    // Payment breakdown
    let cash = 0;
    let credit = 0;

    for (const sale of sales) {
      if (sale.isCancelled) continue;

      const saleDate = this.toPeruDate(new Date(sale.date));
      const dayKey = `${String(saleDate.getDate()).padStart(2, '0')}/${String(saleDate.getMonth() + 1).padStart(2, '0')}`;
      if (dailyMap[dayKey] !== undefined) {
        dailyMap[dayKey] += sale.total;
      }

      const hour = saleDate.getHours();
      hourMap[hour].total += sale.total;
      hourMap[hour].count += 1;

      if (sale.isCredit) {
        credit += sale.total;
      } else {
        cash += sale.total;
      }
    }

    const dailySales = Object.entries(dailyMap).map(([date, total]) => ({
      date,
      total: Math.round(total * 100) / 100,
    }));

    const salesByHour = Object.entries(hourMap).map(([hour, data]) => ({
      hour: `${hour}:00`,
      total: Math.round(data.total * 100) / 100,
      count: data.count,
    }));

    const paymentBreakdown = {
      cash: Math.round(cash * 100) / 100,
      credit: Math.round(credit * 100) / 100,
    };

    return { dailySales, salesByHour, paymentBreakdown };
  }
}
