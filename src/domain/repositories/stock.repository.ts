import { StockEntity } from '../entities/stock.entity';

export interface IStockRepository {
  findByProductAndCompany(productId: string, companyId: string, branchId?: string): Promise<StockEntity | null>;
  findByCompany(companyId: string, page?: number, limit?: number, branchId?: string): Promise<{ data: StockEntity[]; total: number }>;
  findByProduct(productId: string, branchId?: string): Promise<StockEntity[]>;
  findAll(branchId?: string): Promise<StockEntity[]>;
  upsert(productId: string, companyId: string, quantityChange: number, branchId?: string): Promise<StockEntity>;
  decrementToZero(productId: string, companyId: string, quantity: number, branchId?: string): Promise<StockEntity | null>;
  getLowStock(companyId: string, threshold: number, branchId?: string): Promise<StockEntity[]>;
}

export const STOCK_REPOSITORY = 'STOCK_REPOSITORY';
