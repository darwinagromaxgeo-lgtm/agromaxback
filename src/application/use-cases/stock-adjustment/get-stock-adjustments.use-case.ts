import { Injectable, Inject } from '@nestjs/common';
import { IStockAdjustmentRepository, STOCK_ADJUSTMENT_REPOSITORY } from '../../../domain/repositories/stock-adjustment.repository';
import { FilterStockAdjustmentDto } from '../../dtos/stock-adjustment/filter-stock-adjustment.dto';

@Injectable()
export class GetStockAdjustmentsUseCase {
  constructor(
    @Inject(STOCK_ADJUSTMENT_REPOSITORY) private readonly adjustmentRepository: IStockAdjustmentRepository,
  ) {}

  async execute(filter: FilterStockAdjustmentDto) {
    return this.adjustmentRepository.findAll(
      {
        productId: filter.productId,
        companyId: filter.companyId,
        startDate: filter.startDate ? new Date(filter.startDate + 'T00:00:00.000-05:00') : undefined,
        endDate: filter.endDate ? new Date(filter.endDate + 'T23:59:59.999-05:00') : undefined,
      },
      filter.page,
      filter.limit,
    );
  }
}
