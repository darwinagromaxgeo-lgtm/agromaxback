export interface CreditPaymentEntity {
  id?: string;
  amount: number;
  paymentDate: Date;
  paymentMethodId?: string;
  paymentMethodName?: string;
  cashRegisterEntryId?: string;
  notes?: string;
  receivedBy?: string;
  receivedByName?: string;
}

export interface CreditSaleItemDetail {
  productName: string;
  companyName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface CreditSaleDetail {
  saleId: string;
  date: Date;
  items: CreditSaleItemDetail[];
  total: number;
}

export interface CreditAccountEntity {
  id?: string;
  branchId: string;
  clientId: string;
  name?: string;
  saleIds: string[];
  saleDetails?: CreditSaleDetail[];
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  status: 'PENDING' | 'PARTIAL' | 'PAID' | 'CANCELLED';
  payments: CreditPaymentEntity[];
  createdBy?: string;
  createdAt?: Date;
}
