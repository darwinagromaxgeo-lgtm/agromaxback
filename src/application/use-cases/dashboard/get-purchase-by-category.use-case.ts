import { Injectable, Inject } from '@nestjs/common';
import { IPurchaseRepository, PURCHASE_REPOSITORY } from '../../../domain/repositories/purchase.repository';
import { IProductRepository, PRODUCT_REPOSITORY } from '../../../domain/repositories/product.repository';
import { ICategoryRepository, CATEGORY_REPOSITORY } from '../../../domain/repositories/category.repository';

@Injectable()
export class GetPurchaseByCategoryUseCase {
  constructor(
    @Inject(PURCHASE_REPOSITORY) private readonly purchaseRepository: IPurchaseRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly productRepository: IProductRepository,
    @Inject(CATEGORY_REPOSITORY) private readonly categoryRepository: ICategoryRepository,
  ) {}

  async execute(startDate?: Date, endDate?: Date) {
    const now = new Date();
    const start = startDate ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const end = endDate ?? now;

    const { data: purchases } = await this.purchaseRepository.findAll({ startDate: start, endDate: end }, 1, 2000);
    const { data: products } = await this.productRepository.findAll({}, 1, 5000);
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

    const totals: Record<string, { name: string; total: number; count: number }> = {};

    for (const purchase of purchases) {
      for (const item of purchase.items) {
        const catId = productCategoryMap[item.productId];
        if (!catId) continue;
        const catName = categoryNameMap[catId] ?? 'Sin categoría';
        if (!totals[catName]) totals[catName] = { name: catName, total: 0, count: 0 };
        totals[catName].total += (item.unitCost ?? 0) * item.quantity;
        totals[catName].count += item.quantity;
      }
    }

    return Object.values(totals)
      .map((t) => ({ ...t, total: Math.round(t.total * 100) / 100 }))
      .sort((a, b) => b.total - a.total);
  }
}
