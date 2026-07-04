import { Injectable, Inject } from '@nestjs/common';
import { IPurchaseRepository, PURCHASE_REPOSITORY } from '../../../domain/repositories/purchase.repository';

@Injectable()
export class GetTopSuppliersUseCase {
  constructor(
    @Inject(PURCHASE_REPOSITORY) private readonly purchaseRepository: IPurchaseRepository,
  ) {}

  async execute(startDate?: Date, endDate?: Date, limit = 5) {
    const now = new Date();
    const start = startDate ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const end = endDate ?? now;

    const { data: purchases } = await this.purchaseRepository.findAll({ startDate: start, endDate: end }, 1, 2000);

    const supplierTotals: Record<string, { name: string; total: number; count: number }> = {};

    for (const purchase of purchases) {
      const key = purchase.supplierId ?? purchase.supplier;
      const name = purchase.supplier;
      if (!supplierTotals[key]) {
        supplierTotals[key] = { name, total: 0, count: 0 };
      }
      supplierTotals[key].total += purchase.totalCost;
      supplierTotals[key].count += 1;
    }

    return Object.values(supplierTotals)
      .map((s) => ({ ...s, total: Math.round(s.total * 100) / 100 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);
  }
}
