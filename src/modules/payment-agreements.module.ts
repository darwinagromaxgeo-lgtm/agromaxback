import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentAgreementDocument, PaymentAgreementSchema } from '../infrastructure/database/mongodb/schemas/payment-agreement.schema';
import { MongoPaymentAgreementRepository } from '../infrastructure/database/mongodb/repositories/mongo-payment-agreement.repository';
import { PAYMENT_AGREEMENT_REPOSITORY } from '../domain/repositories/payment-agreement.repository';
import { AccountPayableModule } from './account-payable.module';
import { CloudinaryModule } from '../infrastructure/cloudinary/cloudinary.module';
import { GetAllPaymentAgreementsUseCase } from '../application/use-cases/payment-agreement/get-all-payment-agreements.use-case';
import { GetPaymentAgreementByIdUseCase } from '../application/use-cases/payment-agreement/get-payment-agreement-by-id.use-case';
import { CreatePaymentAgreementUseCase } from '../application/use-cases/payment-agreement/create-payment-agreement.use-case';
import { RegisterAgreementPaymentUseCase } from '../application/use-cases/payment-agreement/register-agreement-payment.use-case';
import { CancelPaymentAgreementUseCase } from '../application/use-cases/payment-agreement/cancel-payment-agreement.use-case';
import { PaymentAgreementController } from '../presentation/controllers/payment-agreement.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: PaymentAgreementDocument.name, schema: PaymentAgreementSchema }]),
    AccountPayableModule,
    CloudinaryModule,
  ],
  controllers: [PaymentAgreementController],
  providers: [
    { provide: PAYMENT_AGREEMENT_REPOSITORY, useClass: MongoPaymentAgreementRepository },
    GetAllPaymentAgreementsUseCase,
    GetPaymentAgreementByIdUseCase,
    CreatePaymentAgreementUseCase,
    RegisterAgreementPaymentUseCase,
    CancelPaymentAgreementUseCase,
  ],
})
export class PaymentAgreementsModule {}
