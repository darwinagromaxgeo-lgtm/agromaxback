import { StockMovementEntity } from '../entities/stock-movement.entity';

export interface IStockMovementRepository {
  create(movement: StockMovementEntity): Promise<StockMovementEntity>;
  findAll(
    filter?: {
      productId?: string;
      companyId?: string;
      branchId?: string;
      movementType?: string;
      startDate?: Date;
      endDate?: Date;
    },
    page?: number,
    limit?: number,
  ): Promise<{ data: StockMovementEntity[]; total: number }>;
}

export const STOCK_MOVEMENT_REPOSITORY = 'STOCK_MOVEMENT_REPOSITORY';
