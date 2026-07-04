import { PriceTierEntity } from '../entities/price-range.entity';

export interface IPriceTierRepository {
  create(tier: PriceTierEntity): Promise<PriceTierEntity>;
  findAll(filter?: { isActive?: boolean }): Promise<PriceTierEntity[]>;
  findById(id: string): Promise<PriceTierEntity | null>;
  update(id: string, tier: Partial<PriceTierEntity>): Promise<PriceTierEntity | null>;
  findByName(name: string): Promise<PriceTierEntity | null>;
}

export const PRICE_TIER_REPOSITORY = 'PRICE_TIER_REPOSITORY';
