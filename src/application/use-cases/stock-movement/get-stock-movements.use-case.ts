import { Injectable, Inject } from '@nestjs/common';
import { IStockMovementRepository, STOCK_MOVEMENT_REPOSITORY } from '../../../domain/repositories/stock-movement.repository';
import { FilterStockMovementDto } from '../../dtos/stock-movement/filter-stock-movement.dto';

@Injectable()
export class GetStockMovementsUseCase {
  constructor(
    @Inject(STOCK_MOVEMENT_REPOSITORY) private readonly movementRepository: IStockMovementRepository,
  ) {}

  async execute(filter: FilterStockMovementDto) {
    return this.movementRepository.findAll(
      {
        productId: filter.productId,
        companyId: filter.companyId,
        movementType: filter.movementType,
        startDate: filter.startDate ? new Date(filter.startDate + 'T00:00:00.000-05:00') : undefined,
        endDate: filter.endDate ? new Date(filter.endDate + 'T23:59:59.999-05:00') : undefined,
      },
      filter.page,
      filter.limit,
    );
  }
}
