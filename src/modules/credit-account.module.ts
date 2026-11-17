import { Module, forwardRef } from '@nestjs/common';
import { BillingPersistenceModule } from './billing-persistence.module';
import { MongooseModule } from '@nestjs/mongoose';
import { CreditAccountDocument, CreditAccountSchema } from '../infrastructure/database/mongodb/schemas/credit-account.schema';
import { SaleDocument, SaleSchema } from '../infrastructure/database/mongodb/schemas/sale.schema';
import { MongoCreditAccountRepository } from '../infrastructure/database/mongodb/repositories/mongo-credit-account.repository';
import { CREDIT_ACCOUNT_REPOSITORY } from '../domain/repositories/credit-account.repository';
import { CreateCreditAccountUseCase } from '../application/use-cases/credit-account/create-credit-account.use-case';
import { RegisterPaymentUseCase } from '../application/use-cases/credit-account/register-payment.use-case';
import { RegisterBatchPaymentUseCase } from '../application/use-cases/credit-account/register-batch-payment.use-case';
import { GetClientCreditsUseCase } from '../application/use-cases/credit-account/get-client-credits.use-case';
import { GetAllCreditsUseCase } from '../application/use-cases/credit-account/get-all-credits.use-case';
import { EditCreditUseCase } from '../application/use-cases/credit-account/edit-credit.use-case';
import { DeleteCreditUseCase } from '../application/use-cases/credit-account/delete-credit.use-case';
import { AddSaleToCreditUseCase } from '../application/use-cases/credit-account/add-sale-to-credit.use-case';
import { CreditAccountController } from '../presentation/controllers/credit-account.controller';
import { CashRegisterModule } from './cash-register.module';
import { ClientModule } from './client.module';
import { PaymentMethodModule } from './payment-method.module';
import { SaleModule } from './sale.module';
import { StockModule } from './stock.module';
import { StockMovementModule } from './stock-movement.module';
import { ProductModule } from './product.module';

@Module({
  imports: [MongooseModule.forFeature([{ name: CreditAccountDocument.name, schema: CreditAccountSchema }, { name: SaleDocument.name, schema: SaleSchema }]), forwardRef(() => CashRegisterModule), ClientModule, PaymentMethodModule, forwardRef(() => SaleModule), StockModule, StockMovementModule, ProductModule, BillingPersistenceModule],
  controllers: [CreditAccountController],
  providers: [
    { provide: CREDIT_ACCOUNT_REPOSITORY, useClass: MongoCreditAccountRepository },
    CreateCreditAccountUseCase, RegisterPaymentUseCase, RegisterBatchPaymentUseCase, GetClientCreditsUseCase, GetAllCreditsUseCase, EditCreditUseCase, DeleteCreditUseCase, AddSaleToCreditUseCase,
  ],
  exports: [CREDIT_ACCOUNT_REPOSITORY, CreateCreditAccountUseCase, AddSaleToCreditUseCase],
})
export class CreditAccountModule {}
