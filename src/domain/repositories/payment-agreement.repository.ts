import { PaymentAgreementEntity } from '../entities/payment-agreement.entity';

export interface IPaymentAgreementRepository {
  create(entity: PaymentAgreementEntity): Promise<PaymentAgreementEntity>;
  findById(id: string): Promise<PaymentAgreementEntity | null>;
  findAll(filter?: { supplier?: string; status?: string }): Promise<PaymentAgreementEntity[]>;
  update(id: string, data: Partial<PaymentAgreementEntity>): Promise<PaymentAgreementEntity | null>;
  addPayment(id: string, payment: any): Promise<PaymentAgreementEntity | null>;
  setPaymentVoucher(agreementId: string, paymentId: string, voucherUrl: string): Promise<void>;
  setInstallmentVoucher(agreementId: string, installmentId: string, voucherUrl: string): Promise<void>;
}

export const PAYMENT_AGREEMENT_REPOSITORY = 'PAYMENT_AGREEMENT_REPOSITORY';
