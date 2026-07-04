import { Injectable } from '@nestjs/common';
import axios from 'axios';

export interface ExchangeRatePoint { date: string; compra: number; venta: number; }

@Injectable()
export class GetExchangeRateUseCase {
  async execute(days: number): Promise<ExchangeRatePoint[]> {
    const apiKey = process.env.DECOLECTA_API_KEY;

    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate() - days + 1);

    // Collect unique year-month pairs in the range
    const months = new Map<string, { month: number; year: number }>();
    const cursor = new Date(start);
    cursor.setDate(1); // start from the 1st to iterate months
    while (cursor <= today) {
      const key = `${cursor.getFullYear()}-${cursor.getMonth() + 1}`;
      months.set(key, { month: cursor.getMonth() + 1, year: cursor.getFullYear() });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    const allPoints: ExchangeRatePoint[] = [];

    for (const { month, year } of months.values()) {
      try {
        const { data } = await axios.get('https://api.decolecta.com/v1/tipo-cambio/sunat', {
          params: { month, year },
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 8000,
        });
        const items: any[] = Array.isArray(data) ? data : (data?.data ?? []);
        for (const item of items) {
          allPoints.push({
            date: item.date ?? item.fecha,
            compra: parseFloat(item.buy_price ?? item.compra),
            venta: parseFloat(item.sell_price ?? item.venta),
          });
        }
      } catch {
        // si falla un mes, continúa
      }
    }

    const startStr = start.toISOString().split('T')[0];
    const todayStr = today.toISOString().split('T')[0];

    return allPoints
      .filter(p => p.date >= startStr && p.date <= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}
