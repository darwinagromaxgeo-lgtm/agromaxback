import { Injectable, Inject } from '@nestjs/common';
import { ISaleRepository, SALE_REPOSITORY } from '../../../domain/repositories/sale.repository';
import { IProductRepository, PRODUCT_REPOSITORY } from '../../../domain/repositories/product.repository';

@Injectable()
export class GetProfitabilityUseCase {
  constructor(
    @Inject(SALE_REPOSITORY) private readonly saleRepository: ISaleRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly productRepository: IProductRepository,
  ) {}

  async execute() {
    const now = new Date();
    const monthAgo = new Date(now.toLocaleString('en-US', { timeZone: 'America/Lima' }));
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    const { data: sales } = await this.saleRepository.findAll({ startDate: monthAgo, endDate: now }, 1, 1000);

    const productStats: Record<string, { productId: string; productName: string; totalSold: number; totalRevenue: number; count: number }> = {};

    for (const sale of sales) {
      if (sale.isCancelled) continue;
      for (const item of sale.items) {
        if (!productStats[item.productId]) {
          productStats[item.productId] = { productId: item.productId, productName: '', totalSold: 0, totalRevenue: 0, count: 0 };
        }
        productStats[item.productId].totalSold += item.quantity;
        productStats[item.productId].totalRevenue += item.subtotal;
        productStats[item.productId].count += 1;
      }
    }

    const productIds = Object.keys(productStats);
    const products = await Promise.all(productIds.map((id) => this.productRepository.findById(id).catch(() => null)));
    products.forEach((p, i) => {
      productStats[productIds[i]].productName = p?.name || 'Producto eliminado';
    });

    return Object.values(productStats).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }
}
