import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccountPayableDocument, AccountPayableSchema } from '../infrastructure/database/mongodb/schemas/account-payable.schema';
import { MongoAccountPayableRepository } from '../infrastructure/database/mongodb/repositories/mongo-account-payable.repository';
import { ACCOUNT_PAYABLE_REPOSITORY } from '../domain/repositories/account-payable.repository';
import { CreateAccountPayableUseCase } from '../application/use-cases/account-payable/create-account-payable.use-case';
import { GetAllAccountsPayableUseCase } from '../application/use-cases/account-payable/get-all-accounts-payable.use-case';
import { GetAccountPayableByIdUseCase } from '../application/use-cases/account-payable/get-account-payable-by-id.use-case';
import { RegisterAPPaymentUseCase } from '../application/use-cases/account-payable/register-ap-payment.use-case';
import { GetAPAlertsUseCase } from '../application/use-cases/account-payable/get-ap-alerts.use-case';
import { AccountPayableController } from '../presentation/controllers/account-payable.controller';
import { CloudinaryModule } from '../infrastructure/cloudinary/cloudinary.module';

@Module({
  imports: [MongooseModule.forFeature([{ name: AccountPayableDocument.name, schema: AccountPayableSchema }]), CloudinaryModule],
  controllers: [AccountPayableController],
  providers: [
    { provide: ACCOUNT_PAYABLE_REPOSITORY, useClass: MongoAccountPayableRepository },
    CreateAccountPayableUseCase,
    GetAllAccountsPayableUseCase,
    GetAccountPayableByIdUseCase,
    RegisterAPPaymentUseCase,
    GetAPAlertsUseCase,
  ],
  exports: [ACCOUNT_PAYABLE_REPOSITORY, CreateAccountPayableUseCase],
})
export class AccountPayableModule {}
