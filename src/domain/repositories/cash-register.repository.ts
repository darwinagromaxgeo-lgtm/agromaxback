import { CashRegisterEntity } from '../entities/cash-register.entity';

export interface ICashRegisterRepository {
  create(register: CashRegisterEntity): Promise<CashRegisterEntity>;
  findByDate(date: string, branchId?: string): Promise<CashRegisterEntity | null>;
  findById(id: string, branchId?: string): Promise<CashRegisterEntity | null>;
  findAll(filter?: { branchId?: string; startDate?: string; endDate?: string; status?: string }, page?: number, limit?: number): Promise<{ data: CashRegisterEntity[]; total: number }>;
  update(id: string, data: Partial<CashRegisterEntity>, branchId?: string): Promise<CashRegisterEntity | null>;
  adjustOpeningBalance(
    id: string,
    newBalance: number,
    historyEntry: { previousAmount: number; newAmount: number; reason: string; adjustedBy?: string; adjustedAt: Date }, branchId?: string,
  ): Promise<CashRegisterEntity | null>;
  addEntry(id: string, entry: any, branchId?: string): Promise<CashRegisterEntity | null>;
  updateEntry(registerId: string, entryId: string, data: any, branchId?: string): Promise<CashRegisterEntity | null>;
}

export const CASH_REGISTER_REPOSITORY = 'CASH_REGISTER_REPOSITORY';
