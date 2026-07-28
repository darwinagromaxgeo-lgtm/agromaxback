import { Injectable, Inject } from '@nestjs/common';
import { IStockMovementRepository, STOCK_MOVEMENT_REPOSITORY } from '../../../domain/repositories/stock-movement.repository';
import { StockMovementEntity } from '../../../domain/entities/stock-movement.entity';

export interface RecordMovementParams {
  productId: string;
  companyId: string;
  branchId?: string;
  movementType: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  referenceId?: string;
  referenceType?: string;
  description: string;
  userId?: string;
  date: Date;
}

@Injectable()
export class RecordStockMovementUseCase {
  constructor(
    @Inject(STOCK_MOVEMENT_REPOSITORY) private readonly movementRepository: IStockMovementRepository,
  ) {}

  async execute(params: RecordMovementParams): Promise<StockMovementEntity> {
    return this.movementRepository.create({
      productId: params.productId,
      companyId: params.companyId,
      branchId: params.branchId,
      movementType: params.movementType,
      quantity: params.quantity,
      previousStock: params.previousStock,
      newStock: params.newStock,
      referenceId: params.referenceId,
      referenceType: params.referenceType,
      description: params.description,
      userId: params.userId,
      date: params.date,
    });
  }
}
