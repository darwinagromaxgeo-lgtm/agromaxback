import { Injectable, Inject } from '@nestjs/common';
import { IStockRepository, STOCK_REPOSITORY } from '../../../domain/repositories/stock.repository';

@Injectable()
export class GetLowStockAlertsUseCase {
  constructor(@Inject(STOCK_REPOSITORY) private readonly stockRepository: IStockRepository) {}
  async execute(companyId: string, threshold = 10) { return this.stockRepository.getLowStock(companyId, threshold); }
}
