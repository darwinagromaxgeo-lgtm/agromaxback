import { Injectable, Inject } from '@nestjs/common';
import { IProductLotRepository, PRODUCT_LOT_REPOSITORY } from '../../../domain/repositories/product-lot.repository';

@Injectable()
export class GetProductLotsUseCase {
  constructor(
    @Inject(PRODUCT_LOT_REPOSITORY) private readonly lotRepo: IProductLotRepository,
  ) {}

  async execute(params: { productId?: string; companyId?: string; activeOnly?: boolean }) {
    const activeOnly = params.activeOnly ?? true;
    if (params.companyId && params.productId) {
      return this.lotRepo.findByProductAndCompany(params.productId, params.companyId, activeOnly);
    }
    if (params.productId) {
      return this.lotRepo.findByProduct(params.productId, activeOnly);
    }
    if (params.companyId) {
      return this.lotRepo.findByCompany(params.companyId, activeOnly);
    }
    return [];
  }

  async expiring(companyId: string, days: number) {
    return this.lotRepo.findExpiring(companyId, days);
  }
}
