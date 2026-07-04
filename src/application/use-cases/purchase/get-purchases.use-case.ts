import { Injectable, Inject } from '@nestjs/common';
import { IPurchaseRepository, PURCHASE_REPOSITORY } from '../../../domain/repositories/purchase.repository';
import { FilterPurchaseDto } from '../../dtos/purchase/filter-purchase.dto';

@Injectable()
export class GetPurchasesUseCase {
  constructor(@Inject(PURCHASE_REPOSITORY) private readonly purchaseRepository: IPurchaseRepository) {}

  async execute(filter: FilterPurchaseDto) {
    return this.purchaseRepository.findAll({
      companyId: filter.companyId,
      startDate: filter.startDate ? new Date(filter.startDate + 'T00:00:00.000-05:00') : undefined,
      endDate: filter.endDate ? new Date(filter.endDate + 'T23:59:59.999-05:00') : undefined,
    }, filter.page, filter.limit);
  }
}
