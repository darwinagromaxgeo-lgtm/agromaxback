import { Injectable, Inject } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { IProductRepository, PRODUCT_REPOSITORY } from '../../../domain/repositories/product.repository';
import { ICategoryRepository, CATEGORY_REPOSITORY } from '../../../domain/repositories/category.repository';
import { IUnitRepository, UNIT_REPOSITORY } from '../../../domain/repositories/unit.repository';

export interface ImportResult {
  created: number;
  updated: number;
  errors: string[];
}

@Injectable()
export class ImportProductsUseCase {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly productRepo: IProductRepository,
    @Inject(CATEGORY_REPOSITORY) private readonly categoryRepo: ICategoryRepository,
    @Inject(UNIT_REPOSITORY) private readonly unitRepo: IUnitRepository,
  ) {}

  async execute(buffer: Buffer): Promise<ImportResult> {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // Row 1 = title, Row 2 = headers, Rows 3+ = data
    const dataRows = rows.slice(2);

    const result: ImportResult = { created: 0, updated: 0, errors: [] };

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNum = i + 3;

      try {
        const name = String(row[0] ?? '').trim();
        if (!name) continue;

        const unitRaw     = String(row[1] ?? '').trim();
        const activeIng   = String(row[2] ?? '').trim();
        const fechaVenc   = row[3];
        const supplierRaw = String(row[4] ?? '').trim();
        const catName     = String(row[5] ?? '').trim();
        const subCatName  = String(row[6] ?? '').trim();
        const control     = String(row[7] ?? '').trim();
        const cultivo     = String(row[8] ?? '').trim();
        const dosis       = String(row[9] ?? '').trim();
        const ubicRaw     = String(row[10] ?? '').trim();
        const igv         = Number(row[11] ?? 0.18);

        // Resolve category
        let categoryId = '';
        if (catName) {
          let cat = await this.categoryRepo.findByNameAndParent(catName, null);
          if (!cat) {
            cat = await this.categoryRepo.create({ name: catName, isActive: true });
          }
          categoryId = cat.id!;

          // Resolve subcategory under the parent category
          if (subCatName) {
            let sub = await this.categoryRepo.findByNameAndParent(subCatName, cat.id!);
            if (!sub) {
              sub = await this.categoryRepo.create({ name: subCatName, isActive: true, parentId: cat.id });
            }
            categoryId = sub.id!;
          }
        }

        const tracksLot = fechaVenc !== '' && fechaVenc !== 0 && fechaVenc !== null && fechaVenc !== undefined;
        const taxType = igv === 0 ? 'EXONERADO' : 'GRAVADO';
        const locations = ubicRaw ? ubicRaw.split(' - ').map(s => s.trim()).filter(Boolean) : [];
        const location = locations.join(' - ') || undefined;

        // Crear unidad si no existe (si viene vacía, usar 'S/U' como placeholder)
        const unit = unitRaw || 'S/U';
        const existingUnit = await this.unitRepo.findByName(unit);
        if (!existingUnit) {
          await this.unitRepo.create({ name: unit, isActive: true });
        }

        const productData: any = {
          name,
          unit,
          categoryId: categoryId || undefined,
          activeIngredient: activeIng || undefined,
          supplier: supplierRaw || undefined,
          control: control || undefined,
          cultivo: cultivo || undefined,
          dosis: dosis || undefined,
          locations,
          location,
          tracksLot,
          taxType,
        };

        const existing = await this.productRepo.findByName(name);
        if (existing) {
          await this.productRepo.update(existing.id!, productData);
          result.updated++;
        } else {
          await this.productRepo.create({
            ...productData,
            prices: [],
            isActive: true,
          });
          result.created++;
        }
      } catch (err: any) {
        result.errors.push(`Fila ${rowNum}: ${err?.message || 'Error desconocido'}`);
      }
    }

    return result;
  }
}
