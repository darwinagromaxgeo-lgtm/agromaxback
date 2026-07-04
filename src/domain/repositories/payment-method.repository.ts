import { PaymentMethodEntity } from '../entities/payment-method.entity';

export interface IPaymentMethodRepository {
  create(paymentMethod: PaymentMethodEntity): Promise<PaymentMethodEntity>;
  findAll(): Promise<PaymentMethodEntity[]>;
  findById(id: string): Promise<PaymentMethodEntity | null>;
  findByName(name: string): Promise<PaymentMethodEntity | null>;
  update(id: string, paymentMethod: Partial<PaymentMethodEntity>): Promise<PaymentMethodEntity | null>;
}

export const PAYMENT_METHOD_REPOSITORY = 'PAYMENT_METHOD_REPOSITORY';
