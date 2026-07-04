import { StockEntity } from '../entities/stock.entity';

export interface IStockRepository {
  findByProductAndCompany(productId: string, companyId: string): Promise<StockEntity | null>;
  findByCompany(companyId: string, page?: number, limit?: number): Promise<{ data: StockEntity[]; total: number }>;
  findByProduct(productId: string): Promise<StockEntity[]>;
  findAll(): Promise<StockEntity[]>;
  upsert(productId: string, companyId: string, quantityChange: number): Promise<StockEntity>;
  decrementToZero(productId: string, companyId: string, quantity: number): Promise<StockEntity | null>;
  getLowStock(companyId: string, threshold: number): Promise<StockEntity[]>;
}

export const STOCK_REPOSITORY = 'STOCK_REPOSITORY';
