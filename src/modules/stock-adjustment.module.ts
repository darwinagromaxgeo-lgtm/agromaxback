import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StockAdjustmentDocument, StockAdjustmentSchema } from '../infrastructure/database/mongodb/schemas/stock-adjustment.schema';
import { MongoStockAdjustmentRepository } from '../infrastructure/database/mongodb/repositories/mongo-stock-adjustment.repository';
import { STOCK_ADJUSTMENT_REPOSITORY } from '../domain/repositories/stock-adjustment.repository';
import { CreateStockAdjustmentUseCase } from '../application/use-cases/stock-adjustment/create-stock-adjustment.use-case';
import { GetStockAdjustmentsUseCase } from '../application/use-cases/stock-adjustment/get-stock-adjustments.use-case';
import { StockAdjustmentController } from '../presentation/controllers/stock-adjustment.controller';
import { StockModule } from './stock.module';
import { StockMovementModule } from './stock-movement.module';
import { ProductLotModule } from './product-lot.module';
import { ProductModule } from './product.module';

@Module({
  imports: [MongooseModule.forFeature([{ name: StockAdjustmentDocument.name, schema: StockAdjustmentSchema }]), StockModule, StockMovementModule, ProductLotModule, ProductModule],
  controllers: [StockAdjustmentController],
  providers: [
    { provide: STOCK_ADJUSTMENT_REPOSITORY, useClass: MongoStockAdjustmentRepository },
    CreateStockAdjustmentUseCase, GetStockAdjustmentsUseCase,
  ],
  exports: [STOCK_ADJUSTMENT_REPOSITORY],
})
export class StockAdjustmentModule {}
