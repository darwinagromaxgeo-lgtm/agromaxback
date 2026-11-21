import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StockAdjustmentDocument, StockAdjustmentSchema } from '../infrastructure/database/mongodb/schemas/stock-adjustment.schema';
import { MongoStockAdjustmentRepository } from '../infrastructure/database/mongodb/repositories/mongo-stock-adjustment.repository';
import { STOCK_ADJUSTMENT_REPOSITORY } from '../domain/repositories/stock-adjustment.repository';
import { CreateStockAdjustmentUseCase } from '../application/use-cases/stock-adjustment/create-stock-adjustment.use-case';
import { GetStockAdjustmentsUseCase } from '../application/use-cases/stock-adjustment/get-stock-adjustments.use-case';
import { StockAdjustmentController } from '../presentation/controllers/stock-adjustment.controller';
import { StockDocument, StockSchema } from '../infrastructure/database/mongodb/schemas/stock.schema';
import { ProductLotDocument, ProductLotSchema } from '../infrastructure/database/mongodb/schemas/product-lot.schema';
import { ProductDocument, ProductSchema } from '../infrastructure/database/mongodb/schemas/product.schema';
import { StockMovementDocument, StockMovementSchema } from '../infrastructure/database/mongodb/schemas/stock-movement.schema';
import { CompanyDocument, CompanySchema } from '../infrastructure/database/mongodb/schemas/company.schema';
import { BranchDocument, BranchSchema } from '../infrastructure/database/mongodb/schemas/branch.schema';
import { StockAdjustmentBatchDocument, StockAdjustmentBatchSchema } from '../infrastructure/database/mongodb/schemas/stock-adjustment-batch.schema';

@Module({
  imports: [MongooseModule.forFeature([
    { name: StockAdjustmentDocument.name, schema: StockAdjustmentSchema },
    { name: StockAdjustmentBatchDocument.name, schema: StockAdjustmentBatchSchema },
    { name: StockDocument.name, schema: StockSchema },
    { name: ProductLotDocument.name, schema: ProductLotSchema },
    { name: ProductDocument.name, schema: ProductSchema },
    { name: StockMovementDocument.name, schema: StockMovementSchema },
    { name: CompanyDocument.name, schema: CompanySchema },
    { name: BranchDocument.name, schema: BranchSchema },
  ])],
  controllers: [StockAdjustmentController],
  providers: [
    { provide: STOCK_ADJUSTMENT_REPOSITORY, useClass: MongoStockAdjustmentRepository },
    CreateStockAdjustmentUseCase, GetStockAdjustmentsUseCase,
  ],
  exports: [STOCK_ADJUSTMENT_REPOSITORY],
})
export class StockAdjustmentModule {}
