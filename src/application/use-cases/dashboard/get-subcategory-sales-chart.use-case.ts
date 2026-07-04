import { Injectable, Inject } from '@nestjs/common';
import { ISaleRepository, SALE_REPOSITORY } from '../../../domain/repositories/sale.repository';
import { IProductRepository, PRODUCT_REPOSITORY } from '../../../domain/repositories/product.repository';
import { ICategoryRepository, CATEGORY_REPOSITORY } from '../../../domain/repositories/category.repository';

@Injectable()
export class GetSubcategorySalesChartUseCase {
  constructor(
    @Inject(SALE_REPOSITORY) private readonly saleRepository: ISaleRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly productRepository: IProductRepository,
    @Inject(CATEGORY_REPOSITORY) private readonly categoryRepository: ICategoryRepository,
  ) {}

  private toPeruDate(date: Date): Date {
    return new Date(date.toLocaleString('en-US', { timeZone: 'America/Lima' }));
  }

  async execute(categoryId: string, startDate?: Date, endDate?: Date) {
    const now = this.toPeruDate(new Date());
    const end = endDate ? this.toPeruDate(endDate) : now;
    const start = startDate ? this.toPeruDate(startDate) : (() => {
      const d = new Date(now);
      d.setDate(d.getDate() - 29);
      return d;
    })();

    const [{ data: sales }, { data: products }, allCategories] = await Promise.all([
      this.saleRepository.findAll({ startDate: start, endDate: end }, 1, 2000),
      this.productRepository.findAll({ isActive: undefined }, 1, 5000),
      this.categoryRepository.findAll(),
    ]);

    // Subcategories of the selected parent
    const subcategories = allCategories.filter((c) => c.parentId === categoryId);
    const subcategoryIds = new Set(subcategories.map((c) => c.id));
    const subcategoryNameMap: Record<string, string> = {};
    for (const c of subcategories) {
      if (c.id) subcategoryNameMap[c.id] = c.name;
    }

    // Products that belong to one of the subcategories
    const productSubcategoryMap: Record<string, string> = {};
    for (const p of products) {
      if (p.id && p.categoryId && subcategoryIds.has(p.categoryId)) {
        productSubcategoryMap[p.id] = p.categoryId;
      }
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

    const dailyData: Record<string, Record<string, number>> = {};
    for (const dk of dateKeys) dailyData[dk] = {};

    const usedSubcategoryIds = new Set<string>();

    for (const sale of sales) {
      if (sale.isCancelled) continue;
      const saleDate = this.toPeruDate(new Date(sale.date));
      const dk = `${String(saleDate.getDate()).padStart(2, '0')}/${String(saleDate.getMonth() + 1).padStart(2, '0')}`;
      if (!dailyData[dk]) continue;

      for (const item of sale.items) {
        const subcatId = productSubcategoryMap[item.productId];
        if (!subcatId) continue;
        const subcatName = subcategoryNameMap[subcatId] ?? 'Sin subcategoría';
        usedSubcategoryIds.add(subcatId);
        dailyData[dk][subcatName] = (dailyData[dk][subcatName] ?? 0) + item.subtotal;
      }
    }

    // Return subcategories in order: those with data first, sorted by name
    const subcategoryList = subcategories
      .filter((c) => c.id && usedSubcategoryIds.has(c.id))
      .map((c) => c.name)
      .sort();

    const result = dateKeys.map((dk) => {
      const row: Record<string, number | string> = { date: dk };
      for (const name of subcategoryList) {
        row[name] = Math.round((dailyData[dk][name] ?? 0) * 100) / 100;
      }
      return row;
    });

    return { dailyData: result, subcategories: subcategoryList };
  }
}
