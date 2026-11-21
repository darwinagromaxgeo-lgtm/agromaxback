import { Injectable, Inject } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { IStockAdjustmentRepository, STOCK_ADJUSTMENT_REPOSITORY } from '../../../domain/repositories/stock-adjustment.repository';
import { CreateStockAdjustmentDto } from '../../dtos/stock-adjustment/create-stock-adjustment.dto';
import { CreateStockAdjustmentBatchDto } from '../../dtos/stock-adjustment/create-stock-adjustment-batch.dto';

@Injectable()
export class CreateStockAdjustmentUseCase {
  constructor(@Inject(STOCK_ADJUSTMENT_REPOSITORY) private readonly repository: IStockAdjustmentRepository) {}

  async execute(dto: CreateStockAdjustmentDto, branchId: string, userId?: string) {
    const { companyId, reason, requestId, ...item } = dto;
    const result = await this.repository.applyBatch({ companyId, reason, requestId: requestId || randomUUID(), items: [item] }, branchId, userId);
    return result.adjustments[0] || { unchanged: true, productId: dto.productId, quantity: dto.quantity };
  }

  executeBatch(dto: CreateStockAdjustmentBatchDto, branchId: string, userId?: string) {
    return this.repository.applyBatch(dto, branchId, userId);
  }
}
