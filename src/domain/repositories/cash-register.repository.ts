import { CashRegisterEntity } from '../entities/cash-register.entity';

export interface ICashRegisterRepository {
  create(register: CashRegisterEntity): Promise<CashRegisterEntity>;
  findByDate(date: string): Promise<CashRegisterEntity | null>;
  findById(id: string): Promise<CashRegisterEntity | null>;
  findAll(filter?: { startDate?: string; endDate?: string; status?: string }, page?: number, limit?: number): Promise<{ data: CashRegisterEntity[]; total: number }>;
  update(id: string, data: Partial<CashRegisterEntity>): Promise<CashRegisterEntity | null>;
  adjustOpeningBalance(
    id: string,
    newBalance: number,
    historyEntry: { previousAmount: number; newAmount: number; reason: string; adjustedBy?: string; adjustedAt: Date },
  ): Promise<CashRegisterEntity | null>;
  addEntry(id: string, entry: any): Promise<CashRegisterEntity | null>;
  updateEntry(registerId: string, entryId: string, data: any): Promise<CashRegisterEntity | null>;
}

export const CASH_REGISTER_REPOSITORY = 'CASH_REGISTER_REPOSITORY';
