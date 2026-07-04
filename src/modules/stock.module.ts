import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StockDocument, StockSchema } from '../infrastructure/database/mongodb/schemas/stock.schema';
import { StockTransferDocument, StockTransferSchema } from '../infrastructure/database/mongodb/schemas/stock-transfer.schema';
import { ProductDocument, ProductSchema } from '../infrastructure/database/mongodb/schemas/product.schema';
import { MongoStockRepository } from '../infrastructure/database/mongodb/repositories/mongo-stock.repository';
import { MongoStockTransferRepository } from '../infrastructure/database/mongodb/repositories/mongo-stock-transfer.repository';
import { MongoProductRepository } from '../infrastructure/database/mongodb/repositories/mongo-product.repository';
import { STOCK_REPOSITORY } from '../domain/repositories/stock.repository';
import { STOCK_TRANSFER_REPOSITORY } from '../domain/repositories/stock-transfer.repository';
import { PRODUCT_REPOSITORY } from '../domain/repositories/product.repository';
import { GetStockByCompanyUseCase } from '../application/use-cases/stock/get-stock-by-company.use-case';
import { TransferStockUseCase } from '../application/use-cases/stock/transfer-stock.use-case';
import { GetLowStockAlertsUseCase } from '../application/use-cases/stock/get-low-stock-alerts.use-case';
import { StockController } from '../presentation/controllers/stock.controller';
import { StockMovementModule } from './stock-movement.module';
import { ProductLotModule } from './product-lot.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StockDocument.name, schema: StockSchema },
      { name: StockTransferDocument.name, schema: StockTransferSchema },
      { name: ProductDocument.name, schema: ProductSchema },
    ]),
    StockMovementModule,
    ProductLotModule,
  ],
  controllers: [StockController],
  providers: [
    { provide: STOCK_REPOSITORY, useClass: MongoStockRepository },
    { provide: STOCK_TRANSFER_REPOSITORY, useClass: MongoStockTransferRepository },
    { provide: PRODUCT_REPOSITORY, useClass: MongoProductRepository },
    GetStockByCompanyUseCase, TransferStockUseCase, GetLowStockAlertsUseCase,
  ],
  exports: [STOCK_REPOSITORY, STOCK_TRANSFER_REPOSITORY],
})
export class StockModule {}
