import { Injectable, Inject, ConflictException } from '@nestjs/common';
import { IPriceTierRepository, PRICE_TIER_REPOSITORY } from '../../../domain/repositories/price-tier.repository';
import { CreatePriceTierDto } from '../../dtos/price-tier/create-price-tier.dto';

@Injectable()
export class CreatePriceTierUseCase {
  constructor(@Inject(PRICE_TIER_REPOSITORY) private readonly priceTierRepository: IPriceTierRepository) {}

  async execute(dto: CreatePriceTierDto) {
    const existing = await this.priceTierRepository.findByName(dto.name);
    if (existing) throw new ConflictException('El nombre de lista de precios ya existe');
    return this.priceTierRepository.create({ name: dto.name, description: dto.description, priority: dto.priority || 0, isActive: true });
  }
}
