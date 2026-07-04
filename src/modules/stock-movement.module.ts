import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StockMovementDocument, StockMovementSchema } from '../infrastructure/database/mongodb/schemas/stock-movement.schema';
import { MongoStockMovementRepository } from '../infrastructure/database/mongodb/repositories/mongo-stock-movement.repository';
import { STOCK_MOVEMENT_REPOSITORY } from '../domain/repositories/stock-movement.repository';
import { RecordStockMovementUseCase } from '../application/use-cases/stock-movement/record-stock-movement.use-case';
import { GetStockMovementsUseCase } from '../application/use-cases/stock-movement/get-stock-movements.use-case';
import { StockMovementController } from '../presentation/controllers/stock-movement.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: StockMovementDocument.name, schema: StockMovementSchema }]),
  ],
  controllers: [StockMovementController],
  providers: [
    { provide: STOCK_MOVEMENT_REPOSITORY, useClass: MongoStockMovementRepository },
    RecordStockMovementUseCase,
    GetStockMovementsUseCase,
  ],
  exports: [RecordStockMovementUseCase],
})
export class StockMovementModule {}
