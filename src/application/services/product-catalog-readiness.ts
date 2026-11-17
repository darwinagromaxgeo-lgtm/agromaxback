import { ProductEntity } from '../../domain/entities/product.entity';
import { sunatUnit } from './billing-calculation';

export function productCatalogPendingFields(product: ProductEntity): string[] {
  const pending: string[] = [];
  if (!['GRAVADO', 'EXONERADO', 'INAFECTO'].includes(product.taxType || '')) pending.push('afectación de IGV');
  try { sunatUnit(product.unit || ''); } catch { pending.push('unidad de venta'); }
  const branchId = product.catalogImport?.branchId;
  if (!product.prices?.some(price => Number.isFinite(price.price) && price.price > 0 && (!price.branchId || !branchId || price.branchId === branchId))) pending.push('precio de venta');
  if (!product.categoryId || product.categoryId === product.catalogImport?.pendingCategoryId) pending.push('categoría');
  return pending;
}
