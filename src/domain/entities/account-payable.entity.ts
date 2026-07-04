export interface AccountPayableInstallment {
  id?: string;
  amount: number;
  dueDate: Date;
  status: 'PENDING' | 'PAID';
  paidDate?: Date;
  paidAmountPen?: number;
}

export interface AccountPayablePayment {
  id?: string;
  amount: number;
  paymentDate: Date;
  codigoTransferencia: string;
  notes?: string;
  registeredBy?: string;
  registeredByName?: string;
}

export interface AccountPayableEntity {
  id?: string;
  purchaseId: string;
  purchaseRef?: string;
  agreementId?: string;
  supplier: string;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  status: 'PENDING' | 'PARTIAL' | 'PAID' | 'CONSOLIDATED';
  paymentScheduleType: 'SINGLE_DATE' | 'INSTALLMENTS' | 'PENDIENTE_ACUERDO';
  dueDate?: Date;
  installments: AccountPayableInstallment[];
  payments: AccountPayablePayment[];
  currency?: 'PEN' | 'USD';
  totalAmountPen?: number;
  createdBy?: string;
  createdAt?: Date;
}
