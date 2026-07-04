export interface CashRegisterEditHistory {
  previousAmount: number;
  newAmount: number;
  reason: string;
  editedBy: string;
  editedAt: Date;
}

export interface CashRegisterEntryEntity {
  id?: string;
  type: 'INCOME' | 'EXPENSE';
  category: 'SALE' | 'CREDIT_PAYMENT' | 'PURCHASE' | 'ADJUSTMENT' | 'OTHER';
  description: string;
  amount: number;
  referenceId?: string;
  referenceType?: string;
  voucherType: string;
  voucherSeries?: string;
  voucherNumber?: string;
  isDeleted: boolean;
  deletedBy?: string;
  deletedAt?: Date;
  deleteReason?: string;
  editHistory: CashRegisterEditHistory[];
  createdBy?: string;
}

export interface OpeningBalanceAdjustment {
  previousAmount: number;
  newAmount: number;
  reason: string;
  adjustedBy?: string;
  adjustedAt: Date;
}

export interface CashRegisterEntity {
  id?: string;
  date: string;
  openingBalance: number;
  openingBalanceHistory?: OpeningBalanceAdjustment[];
  status: 'OPEN' | 'CLOSED';
  entries: CashRegisterEntryEntity[];
  closingBalance?: number;
  closedBy?: string;
  closedAt?: Date;
  notes?: string;
  createdBy?: string;
  createdAt?: Date;
}
