import { ProductLotEntity } from '../entities/product-lot.entity';

export interface IProductLotRepository {
  create(lot: ProductLotEntity): Promise<ProductLotEntity>;
  findByProductCompanyLot(productId: string, companyId: string, lotNumber: string, branchId?: string): Promise<ProductLotEntity | null>;
  findByProductAndCompany(productId: string, companyId: string, activeOnly?: boolean, branchId?: string): Promise<ProductLotEntity[]>;
  findByProduct(productId: string, activeOnly?: boolean, branchId?: string): Promise<ProductLotEntity[]>;
  findByCompany(companyId: string, activeOnly?: boolean, branchId?: string): Promise<ProductLotEntity[]>;
  findExpiring(companyId: string, withinDays: number, branchId?: string): Promise<ProductLotEntity[]>;
  incrementQuantity(id: string, delta: number): Promise<ProductLotEntity | null>;
  /** Descuenta cantidad del lote (venta/FEFO). Auto-desactiva el lote si llega a 0. */
  consumeQuantity(id: string, qty: number): Promise<ProductLotEntity | null>;
  /** Restaura cantidad al lote (anulación). Auto-reactiva el lote si estaba inactivo. */
  restoreQuantity(id: string, qty: number): Promise<ProductLotEntity | null>;
  findById(id: string): Promise<ProductLotEntity | null>;
  findExpiredWithStock(branchId?: string): Promise<ProductLotEntity[]>;
  update(id: string, data: { lotNumber?: string; expirationDate?: Date | null; isActive?: boolean }): Promise<ProductLotEntity | null>;
  /** Ajusta cantidad total e inventario actual en el mismo delta (positivo o negativo). */
  adjustQuantity(id: string, delta: number): Promise<ProductLotEntity | null>;
  /** Descuenta inventario actual y total sin permitir valores negativos. */
  decrementToZero(id: string, quantity: number): Promise<ProductLotEntity | null>;
}

export const PRODUCT_LOT_REPOSITORY = 'PRODUCT_LOT_REPOSITORY';
