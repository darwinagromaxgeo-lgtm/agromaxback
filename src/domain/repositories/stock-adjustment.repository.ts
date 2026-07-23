import { StockAdjustmentEntity } from '../entities/stock-adjustment.entity';

export interface IStockAdjustmentRepository {
  create(adjustment: StockAdjustmentEntity): Promise<StockAdjustmentEntity>;
  findAll(filter?: { productId?: string; companyId?: string; branchId?: string; startDate?: Date; endDate?: Date }, page?: number, limit?: number): Promise<{ data: StockAdjustmentEntity[]; total: number }>;
}

export const STOCK_ADJUSTMENT_REPOSITORY = 'STOCK_ADJUSTMENT_REPOSITORY';
