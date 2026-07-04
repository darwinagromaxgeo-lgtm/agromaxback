import { AccountPayableEntity } from '../entities/account-payable.entity';

export interface IAccountPayableRepository {
  create(ap: AccountPayableEntity): Promise<AccountPayableEntity>;
  findById(id: string): Promise<AccountPayableEntity | null>;
  findByPurchaseId(purchaseId: string): Promise<AccountPayableEntity | null>;
  findAll(filter?: { supplier?: string; status?: string }, page?: number, limit?: number): Promise<{ data: AccountPayableEntity[]; total: number }>;
  update(id: string, data: Partial<AccountPayableEntity>): Promise<AccountPayableEntity | null>;
  addPayment(id: string, payment: any): Promise<AccountPayableEntity | null>;
  setPaymentVoucher(apId: string, paymentId: string, voucherUrl: string): Promise<void>;
  delete(id: string): Promise<void>;
  findUpcoming(days: number): Promise<AccountPayableEntity[]>;
  findOverdue(): Promise<AccountPayableEntity[]>;
  getSummary(): Promise<{ totalPending: number; totalOverdue: number; count: number }>;
}

export const ACCOUNT_PAYABLE_REPOSITORY = 'ACCOUNT_PAYABLE_REPOSITORY';
