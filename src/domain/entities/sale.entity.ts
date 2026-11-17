export interface SaleItemEntity {
  productId: string;
  productName?: string;
  companyId: string;
  quantity: number;
  priceTier: string;
  unitPrice: number;
  subtotal: number;
  unit?: string;
  taxType?: string;
  taxRate?: number;
}

export interface SalePaymentEntity {
  paymentMethodId: string;
  paymentMethodName: string;
  amount: number;
}

export interface SaleEntity {
  id?: string;
  branchId?: string;
  companyId?: string;
  clientId?: string;
  items: SaleItemEntity[];
  total: number;
  voucherType: string;
  isCredit: boolean;
  payments: SalePaymentEntity[];
  isCancelled?: boolean;
  cancelledBy?: string;
  cancelledAt?: Date;
  cancelReason?: string;
  date: Date;
  createdBy?: string;
  createdAt?: Date;
}
