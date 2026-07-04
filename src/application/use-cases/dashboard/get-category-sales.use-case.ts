import { Injectable, Inject } from '@nestjs/common';
import { ISaleRepository, SALE_REPOSITORY } from '../../../domain/repositories/sale.repository';
import { IProductRepository, PRODUCT_REPOSITORY } from '../../../domain/repositories/product.repository';
import { ICategoryRepository, CATEGORY_REPOSITORY } from '../../../domain/repositories/category.repository';

@Injectable()
export class GetCategorySalesUseCase {
  constructor(
    @Inject(SALE_REPOSITORY) private readonly saleRepository: ISaleRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly productRepository: IProductRepository,
    @Inject(CATEGORY_REPOSITORY) private readonly categoryRepository: ICategoryRepository,
  ) {}

  async execute(startDate?: Date, endDate?: Date) {
    const now = new Date();
    const start = startDate ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const end = endDate ?? now;

    const { data: sales } = await this.saleRepository.findAll({ startDate: start, endDate: end }, 1, 2000);
    const { data: products } = await this.productRepository.findAll({ isActive: undefined }, 1, 2000);
    const categories = await this.categoryRepository.findAll();

    const productCategoryMap: Record<string, string> = {};
    for (const p of products) {
      if (p.id) productCategoryMap[p.id] = p.categoryId;
    }

    const categoryMap: Record<string, { name: string; parentId?: string }> = {};
    for (const c of categories) {
      if (c.id) categoryMap[c.id] = { name: c.name, parentId: c.parentId };
    }
    const categoryNameMap: Record<string, string> = {};
    for (const c of categories) {
      if (!c.id) continue;
      categoryNameMap[c.id] = c.parentId && categoryMap[c.parentId] ? categoryMap[c.parentId].name : c.name;
    }

    const categoryTotals: Record<string, number> = {};

    for (const sale of sales) {
      if (sale.isCancelled) continue;
      for (const item of sale.items) {
        const catId = productCategoryMap[item.productId];
        if (!catId) continue;
        const catName = categoryNameMap[catId] ?? 'Sin categoría';
        categoryTotals[catName] = (categoryTotals[catName] ?? 0) + item.subtotal;
      }
    }

    return Object.entries(categoryTotals)
      .map(([name, total]) => ({ name, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => b.total - a.total);
  }
}
