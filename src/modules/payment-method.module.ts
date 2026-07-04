import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentMethodDocument, PaymentMethodSchema } from '../infrastructure/database/mongodb/schemas/payment-method.schema';
import { MongoPaymentMethodRepository } from '../infrastructure/database/mongodb/repositories/mongo-payment-method.repository';
import { PAYMENT_METHOD_REPOSITORY } from '../domain/repositories/payment-method.repository';
import { ManagePaymentMethodsUseCase } from '../application/use-cases/payment-method/manage-payment-methods.use-case';
import { PaymentMethodController } from '../presentation/controllers/payment-method.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: PaymentMethodDocument.name, schema: PaymentMethodSchema }])],
  controllers: [PaymentMethodController],
  providers: [
    { provide: PAYMENT_METHOD_REPOSITORY, useClass: MongoPaymentMethodRepository },
    ManagePaymentMethodsUseCase,
  ],
  exports: [PAYMENT_METHOD_REPOSITORY],
})
export class PaymentMethodModule {}
