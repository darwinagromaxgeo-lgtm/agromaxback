import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StockDocument, StockSchema } from '../infrastructure/database/mongodb/schemas/stock.schema';
import { StockTransferDocument, StockTransferSchema } from '../infrastructure/database/mongodb/schemas/stock-transfer.schema';
import { ProductDocument, ProductSchema } from '../infrastructure/database/mongodb/schemas/product.schema';
import { StockRequestDocument, StockRequestSchema } from '../infrastructure/database/mongodb/schemas/stock-request.schema';
import { MongoStockRepository } from '../infrastructure/database/mongodb/repositories/mongo-stock.repository';
import { MongoStockTransferRepository } from '../infrastructure/database/mongodb/repositories/mongo-stock-transfer.repository';
import { MongoProductRepository } from '../infrastructure/database/mongodb/repositories/mongo-product.repository';
import { MongoStockRequestRepository } from '../infrastructure/database/mongodb/repositories/mongo-stock-request.repository';
import { STOCK_REPOSITORY } from '../domain/repositories/stock.repository';
import { STOCK_TRANSFER_REPOSITORY } from '../domain/repositories/stock-transfer.repository';
import { PRODUCT_REPOSITORY } from '../domain/repositories/product.repository';
import { STOCK_REQUEST_REPOSITORY } from '../domain/repositories/stock-request.repository';
import { GetStockByCompanyUseCase } from '../application/use-cases/stock/get-stock-by-company.use-case';
import { TransferStockUseCase } from '../application/use-cases/stock/transfer-stock.use-case';
import { GetLowStockAlertsUseCase } from '../application/use-cases/stock/get-low-stock-alerts.use-case';
import { GetStockAvailabilityUseCase } from '../application/use-cases/stock/get-stock-availability.use-case';
import { ManageStockRequestsUseCase } from '../application/use-cases/stock/manage-stock-requests.use-case';
import { StockController } from '../presentation/controllers/stock.controller';
import { StockRequestController } from '../presentation/controllers/stock-request.controller';
import { StockMovementModule } from './stock-movement.module';
import { ProductLotModule } from './product-lot.module';
import { BranchModule } from './branch.module';
import { BRANCH_TRANSFER_MODEL, BranchTransferSchema } from '../infrastructure/database/mongodb/schemas/branch-transfer.schema';
import { MongoBranchTransferRepository } from '../infrastructure/database/mongodb/repositories/mongo-branch-transfer.repository';
import { BRANCH_TRANSFER_REPOSITORY } from '../domain/repositories/branch-transfer.repository';
import { DirectBranchTransferUseCase } from '../application/use-cases/stock/direct-branch-transfer.use-case';
import { BranchTransferController } from '../presentation/controllers/branch-transfer.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StockDocument.name, schema: StockSchema },
      { name: StockTransferDocument.name, schema: StockTransferSchema },
      { name: ProductDocument.name, schema: ProductSchema },
      { name: StockRequestDocument.name, schema: StockRequestSchema },
      { name: BRANCH_TRANSFER_MODEL, schema: BranchTransferSchema },
    ]),
    StockMovementModule,
    ProductLotModule,
    BranchModule,
  ],
  controllers: [StockController, StockRequestController, BranchTransferController],
  providers: [
    { provide: STOCK_REPOSITORY, useClass: MongoStockRepository },
    { provide: STOCK_TRANSFER_REPOSITORY, useClass: MongoStockTransferRepository },
    { provide: PRODUCT_REPOSITORY, useClass: MongoProductRepository },
    { provide: STOCK_REQUEST_REPOSITORY, useClass: MongoStockRequestRepository },
    { provide: BRANCH_TRANSFER_REPOSITORY, useClass: MongoBranchTransferRepository },
    DirectBranchTransferUseCase,
    GetStockByCompanyUseCase,
    TransferStockUseCase,
    GetLowStockAlertsUseCase,
    GetStockAvailabilityUseCase,
    ManageStockRequestsUseCase,
  ],
  exports: [STOCK_REPOSITORY, STOCK_TRANSFER_REPOSITORY],
})
export class StockModule {}
