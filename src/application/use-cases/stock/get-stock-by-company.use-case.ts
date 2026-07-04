import { Injectable, Inject } from '@nestjs/common';
import { IStockRepository, STOCK_REPOSITORY } from '../../../domain/repositories/stock.repository';

@Injectable()
export class GetStockByCompanyUseCase {
  constructor(@Inject(STOCK_REPOSITORY) private readonly stockRepository: IStockRepository) {}
  async execute(companyId: string, page = 1, limit = 20) { return this.stockRepository.findByCompany(companyId, page, limit); }
}
