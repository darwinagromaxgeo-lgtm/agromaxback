import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductLotDocument, ProductLotSchema } from '../infrastructure/database/mongodb/schemas/product-lot.schema';
import { StockDocument, StockSchema } from '../infrastructure/database/mongodb/schemas/stock.schema';
import { MongoProductLotRepository } from '../infrastructure/database/mongodb/repositories/mongo-product-lot.repository';
import { MongoStockRepository } from '../infrastructure/database/mongodb/repositories/mongo-stock.repository';
import { PRODUCT_LOT_REPOSITORY } from '../domain/repositories/product-lot.repository';
import { STOCK_REPOSITORY } from '../domain/repositories/stock.repository';
import { UpsertProductLotUseCase } from '../application/use-cases/product-lot/upsert-product-lot.use-case';
import { GetProductLotsUseCase } from '../application/use-cases/product-lot/get-product-lots.use-case';
import { UpdateProductLotUseCase } from '../application/use-cases/product-lot/update-product-lot.use-case';
import { ProductLotController } from '../presentation/controllers/product-lot.controller';
import { StockMovementModule } from './stock-movement.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProductLotDocument.name, schema: ProductLotSchema },
      { name: StockDocument.name, schema: StockSchema },
    ]),
    StockMovementModule,
  ],
  controllers: [ProductLotController],
  providers: [
    { provide: PRODUCT_LOT_REPOSITORY, useClass: MongoProductLotRepository },
    { provide: STOCK_REPOSITORY, useClass: MongoStockRepository },
    UpsertProductLotUseCase,
    GetProductLotsUseCase,
    UpdateProductLotUseCase,
  ],
  exports: [PRODUCT_LOT_REPOSITORY, UpsertProductLotUseCase, GetProductLotsUseCase],
})
export class ProductLotModule {}
