import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { IPriceTierRepository, PRICE_TIER_REPOSITORY } from '../../../domain/repositories/price-tier.repository';
import { UpdatePriceTierDto } from '../../dtos/price-tier/update-price-tier.dto';

@Injectable()
export class UpdatePriceTierUseCase {
  constructor(@Inject(PRICE_TIER_REPOSITORY) private readonly priceTierRepository: IPriceTierRepository) {}

  async execute(id: string, dto: UpdatePriceTierDto) {
    const tier = await this.priceTierRepository.update(id, dto);
    if (!tier) throw new NotFoundException('Lista de precios no encontrada');
    return tier;
  }
}
