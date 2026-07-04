import { CreditAccountEntity } from '../entities/credit-account.entity';

export interface ICreditAccountRepository {
  create(credit: CreditAccountEntity): Promise<CreditAccountEntity>;
  findById(id: string): Promise<CreditAccountEntity | null>;
  findBySaleId(saleId: string): Promise<CreditAccountEntity | null>;
  findByClientId(clientId: string, page?: number, limit?: number): Promise<{ data: CreditAccountEntity[]; total: number }>;
  findOpenByClientId(clientId: string): Promise<CreditAccountEntity[]>;
  findAll(filter?: { clientId?: string; status?: string }, page?: number, limit?: number): Promise<{ data: CreditAccountEntity[]; total: number }>;
  update(id: string, data: Partial<CreditAccountEntity>): Promise<CreditAccountEntity | null>;
  addPayment(id: string, payment: any): Promise<CreditAccountEntity | null>;
  addSale(id: string, saleId: string, amount: number): Promise<CreditAccountEntity | null>;
  delete(id: string): Promise<boolean>;
}

export const CREDIT_ACCOUNT_REPOSITORY = 'CREDIT_ACCOUNT_REPOSITORY';
