import { Injectable, Inject } from '@nestjs/common';
import { IProductRepository, PRODUCT_REPOSITORY } from '../../../domain/repositories/product.repository';

@Injectable()
export class GetPriceFloorAlertsUseCase {
  constructor(@Inject(PRODUCT_REPOSITORY) private readonly productRepository: IProductRepository) {}

  async execute() {
    const { data: products } = await this.productRepository.findAll({ isActive: true }, 1, 10000);

    const alerts = products
      .filter(p => p.minSalePrice != null && p.minSalePrice > 0 && p.prices.length > 0)
      .filter(p => {
        const activePrices = p.prices.filter(pr => pr.price > 0);
        return activePrices.length > 0 && activePrices.some(pr => pr.price <= p.minSalePrice!);
      })
      .map(p => {
        const activePrices = p.prices.filter(pr => pr.price > 0);
        const lowestPrice = Math.min(...activePrices.map(pr => pr.price));
        return { id: p.id, name: p.name, minSalePrice: p.minSalePrice!, lowestPrice };
      });

    return { products: alerts, count: alerts.length };
  }
}
