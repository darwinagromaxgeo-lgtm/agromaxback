import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PurchaseDocument, PurchaseSchema } from '../infrastructure/database/mongodb/schemas/purchase.schema';
import { MongoPurchaseRepository } from '../infrastructure/database/mongodb/repositories/mongo-purchase.repository';
import { PURCHASE_REPOSITORY } from '../domain/repositories/purchase.repository';
import { RegisterPurchaseUseCase } from '../application/use-cases/purchase/register-purchase.use-case';
import { GetPurchasesUseCase } from '../application/use-cases/purchase/get-purchases.use-case';
import { ReceivePurchaseUseCase } from '../application/use-cases/purchase/receive-purchase.use-case';
import { UpdateRemisionGuiaUseCase } from '../application/use-cases/purchase/update-remision-guia.use-case';
import { UpdatePurchaseUseCase } from '../application/use-cases/purchase/update-purchase.use-case';
import { EditPurchaseItemsUseCase } from '../application/use-cases/purchase/edit-purchase-items.use-case';
import { DeletePurchaseUseCase } from '../application/use-cases/purchase/delete-purchase.use-case';
import { PurchaseController } from '../presentation/controllers/purchase.controller';
import { StockModule } from './stock.module';
import { ProductModule } from './product.module';
import { StockMovementModule } from './stock-movement.module';
import { AccountPayableModule } from './account-payable.module';
import { ProductLotModule } from './product-lot.module';
import { PriceTierModule } from './price-tier.module';

@Module({
  imports: [MongooseModule.forFeature([{ name: PurchaseDocument.name, schema: PurchaseSchema }]), StockModule, ProductModule, StockMovementModule, AccountPayableModule, ProductLotModule, PriceTierModule],
  controllers: [PurchaseController],
  providers: [{ provide: PURCHASE_REPOSITORY, useClass: MongoPurchaseRepository }, RegisterPurchaseUseCase, GetPurchasesUseCase, ReceivePurchaseUseCase, UpdateRemisionGuiaUseCase, UpdatePurchaseUseCase, EditPurchaseItemsUseCase, DeletePurchaseUseCase],
  exports: [PURCHASE_REPOSITORY],
})
export class PurchaseModule {}
