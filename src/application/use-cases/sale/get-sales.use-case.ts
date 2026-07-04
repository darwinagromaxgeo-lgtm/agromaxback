import { Injectable, Inject } from '@nestjs/common';
import { ISaleRepository, SALE_REPOSITORY } from '../../../domain/repositories/sale.repository';
import { FilterSaleDto } from '../../dtos/sale/filter-sale.dto';

@Injectable()
export class GetSalesUseCase {
  constructor(@Inject(SALE_REPOSITORY) private readonly saleRepository: ISaleRepository) {}

  async execute(filter: FilterSaleDto) {
    return this.saleRepository.findAll({
      companyId: filter.companyId, clientId: filter.clientId,
      startDate: filter.startDate ? new Date(filter.startDate + 'T00:00:00.000-05:00') : undefined,
      endDate: filter.endDate ? new Date(filter.endDate + 'T23:59:59.999-05:00') : undefined,
      voucherType: filter.voucherType,
    }, filter.page, filter.limit);
  }
}
