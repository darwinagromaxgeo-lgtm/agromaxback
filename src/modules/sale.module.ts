import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SaleDocument, SaleSchema } from '../infrastructure/database/mongodb/schemas/sale.schema';
import { MongoSaleRepository } from '../infrastructure/database/mongodb/repositories/mongo-sale.repository';
import { SALE_REPOSITORY } from '../domain/repositories/sale.repository';
import { CreateSaleUseCase } from '../application/use-cases/sale/create-sale.use-case';
import { GetSalesUseCase } from '../application/use-cases/sale/get-sales.use-case';
import { CancelSaleUseCase } from '../application/use-cases/sale/cancel-sale.use-case';
import { UpdateVoucherUseCase } from '../application/use-cases/sale/update-voucher.use-case';
import { SaleController } from '../presentation/controllers/sale.controller';
import { StockModule } from './stock.module';
import { CashRegisterModule } from './cash-register.module';
import { CreditAccountModule } from './credit-account.module';
import { ProductModule } from './product.module';
import { StockMovementModule } from './stock-movement.module';
import { PaymentMethodModule } from './payment-method.module';
import { ProductLotModule } from './product-lot.module';
import { ClientModule } from './client.module';
import { BillingPersistenceModule } from './billing-persistence.module';
import { UserModule } from './user.module';

@Module({
  imports: [MongooseModule.forFeature([{ name: SaleDocument.name, schema: SaleSchema }]), StockModule, forwardRef(() => CashRegisterModule), CreditAccountModule, ProductModule, StockMovementModule, PaymentMethodModule, ProductLotModule, ClientModule, BillingPersistenceModule, UserModule],
  controllers: [SaleController],
  providers: [{ provide: SALE_REPOSITORY, useClass: MongoSaleRepository }, CreateSaleUseCase, GetSalesUseCase, CancelSaleUseCase, UpdateVoucherUseCase],
  exports: [SALE_REPOSITORY, CreateSaleUseCase],
})
export class SaleModule {}
