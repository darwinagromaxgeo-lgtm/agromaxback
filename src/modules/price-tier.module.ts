import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PriceTierDocument, PriceTierSchema } from '../infrastructure/database/mongodb/schemas/price-tier.schema';
import { MongoPriceTierRepository } from '../infrastructure/database/mongodb/repositories/mongo-price-tier.repository';
import { PRICE_TIER_REPOSITORY } from '../domain/repositories/price-tier.repository';
import { CreatePriceTierUseCase } from '../application/use-cases/price-tier/create-price-tier.use-case';
import { GetPriceTiersUseCase } from '../application/use-cases/price-tier/get-price-tiers.use-case';
import { UpdatePriceTierUseCase } from '../application/use-cases/price-tier/update-price-tier.use-case';
import { PriceTierController } from '../presentation/controllers/price-tier.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: PriceTierDocument.name, schema: PriceTierSchema }])],
  controllers: [PriceTierController],
  providers: [{ provide: PRICE_TIER_REPOSITORY, useClass: MongoPriceTierRepository }, CreatePriceTierUseCase, GetPriceTiersUseCase, UpdatePriceTierUseCase],
  exports: [PRICE_TIER_REPOSITORY],
})
export class PriceTierModule {}
