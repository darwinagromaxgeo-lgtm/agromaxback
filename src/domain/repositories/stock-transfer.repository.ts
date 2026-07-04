import { StockTransferEntity } from '../entities/stock-transfer.entity';

export interface IStockTransferRepository {
  create(transfer: StockTransferEntity): Promise<StockTransferEntity>;
  findAll(filter?: { fromCompanyId?: string; toCompanyId?: string; startDate?: Date; endDate?: Date }, page?: number, limit?: number): Promise<{ data: StockTransferEntity[]; total: number }>;
  findById(id: string): Promise<StockTransferEntity | null>;
}

export const STOCK_TRANSFER_REPOSITORY = 'STOCK_TRANSFER_REPOSITORY';
