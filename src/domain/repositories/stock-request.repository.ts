import { StockRequestEntity, StockRequestStatus } from '../entities/stock-request.entity';

export interface IStockRequestRepository {
  create(request: StockRequestEntity): Promise<StockRequestEntity>;
  findById(id: string): Promise<StockRequestEntity | null>;
  findForBranch(
    branchId: string,
    filter?: { status?: StockRequestStatus; direction?: 'incoming' | 'outgoing' },
    page?: number,
    limit?: number,
  ): Promise<{ data: StockRequestEntity[]; total: number }>;
  update(
    id: string,
    data: Partial<StockRequestEntity>,
    expectedStatus?: StockRequestStatus,
  ): Promise<StockRequestEntity | null>;
}

export const STOCK_REQUEST_REPOSITORY = 'STOCK_REQUEST_REPOSITORY';
