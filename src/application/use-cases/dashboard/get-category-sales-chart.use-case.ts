import { Injectable, Inject } from '@nestjs/common';
import { ISaleRepository, SALE_REPOSITORY } from '../../../domain/repositories/sale.repository';
import { IProductRepository, PRODUCT_REPOSITORY } from '../../../domain/repositories/product.repository';
import { ICategoryRepository, CATEGORY_REPOSITORY } from '../../../domain/repositories/category.repository';

@Injectable()
export class GetCategorySalesChartUseCase {
  constructor(
    @Inject(SALE_REPOSITORY) private readonly saleRepository: ISaleRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly productRepository: IProductRepository,
    @Inject(CATEGORY_REPOSITORY) private readonly categoryRepository: ICategoryRepository,
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

    const [{ data: sales }, { data: products }, categories] = await Promise.all([
      this.saleRepository.findAll({ startDate: start, endDate: end }, 1, 2000),
      this.productRepository.findAll({ isActive: undefined }, 1, 2000),
      this.categoryRepository.findAll(),
    ]);

    const productCategoryMap: Record<string, string> = {};
    for (const p of products) {
      if (p.id) productCategoryMap[p.id] = p.categoryId;
    }

    const categoryMap: Record<string, { name: string; parentId?: string }> = {};
    for (const c of categories) {
      if (c.id) categoryMap[c.id] = { name: c.name, parentId: c.parentId };
    }
    // Resolve subcategories to their top-level parent name
    const categoryNameMap: Record<string, string> = {};
    for (const c of categories) {
      if (!c.id) continue;
      categoryNameMap[c.id] = c.parentId && categoryMap[c.parentId] ? categoryMap[c.parentId].name : c.name;
    }

    // Build date range
    const dateKeys: string[] = [];
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);
    const endDay = new Date(end);
    endDay.setHours(23, 59, 59, 999);
    while (cursor <= endDay) {
      dateKeys.push(`${String(cursor.getDate()).padStart(2, '0')}/${String(cursor.getMonth() + 1).padStart(2, '0')}`);
      cursor.setDate(cursor.getDate() + 1);
    }

    // dailyData: { date, [catName]: number }
    const dailyData: Record<string, Record<string, number>> = {};
    for (const dk of dateKeys) {
      dailyData[dk] = {};
    }

    const categorySet = new Set<string>();

    for (const sale of sales) {
      if (sale.isCancelled) continue;
      const saleDate = this.toPeruDate(new Date(sale.date));
      const dk = `${String(saleDate.getDate()).padStart(2, '0')}/${String(saleDate.getMonth() + 1).padStart(2, '0')}`;
      if (!dailyData[dk]) continue;

      for (const item of sale.items) {
        const catId = productCategoryMap[item.productId];
        if (!catId) continue;
        const catName = categoryNameMap[catId] ?? 'Sin categoría';
        categorySet.add(catName);
        dailyData[dk][catName] = (dailyData[dk][catName] ?? 0) + item.subtotal;
      }
    }

    const categoryList = Array.from(categorySet).sort();

    // Fill missing categories with 0 and round
    const result = dateKeys.map((dk) => {
      const row: Record<string, number | string> = { date: dk };
      for (const cat of categoryList) {
        row[cat] = Math.round((dailyData[dk][cat] ?? 0) * 100) / 100;
      }
      return row;
    });

    return { dailyData: result, categories: categoryList };
  }
}
