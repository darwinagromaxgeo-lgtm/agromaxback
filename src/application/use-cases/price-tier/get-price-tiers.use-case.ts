import { Injectable, Inject } from '@nestjs/common';
import { IPriceTierRepository, PRICE_TIER_REPOSITORY } from '../../../domain/repositories/price-tier.repository';

@Injectable()
export class GetPriceTiersUseCase {
  constructor(@Inject(PRICE_TIER_REPOSITORY) private readonly priceTierRepository: IPriceTierRepository) {}
  async execute(activeOnly = true) { return this.priceTierRepository.findAll(activeOnly ? { isActive: true } : undefined); }
}
