export interface CashRegisterEditHistory {
  previousAmount: number;
  newAmount: number;
  reason: string;
  editedBy: string;
  editedAt: Date;
  previousPaymentMethodName?: string;
  newPaymentMethodName?: string;
}

export interface CashRegisterEntryEntity {
  id?: string;
  type: 'INCOME' | 'EXPENSE';
  category: 'SALE' | 'CREDIT_PAYMENT' | 'PURCHASE' | 'ADJUSTMENT' | 'OTHER' | 'OPERATING_EXPENSE' | 'WITHDRAWAL' | 'CAPITAL_CONTRIBUTION';
  description: string;
  amount: number;
  paymentMethodId?: string;
  paymentMethodName?: string;
  createdAt?: Date;
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
  branchId?: string;
  date: string;
  openingBalance: number;
  openingBalanceHistory?: OpeningBalanceAdjustment[];
  status: 'OPEN' | 'CLOSED';
  entries: CashRegisterEntryEntity[];
  closingBalance?: number;
  cashCount?: {
    expectedAmount: number;
    countedAmount: number;
    difference: number;
    methods: { key: string; name: string; income: number; expense: number; net: number; isCash: boolean }[];
  };
  revision?: number;
  closedBy?: string;
  closedAt?: Date;
  notes?: string;
  createdBy?: string;
  createdAt?: Date;
}
