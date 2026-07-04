export interface AgreementInvoice {
  apId: string;
  purchaseId?: string;
  purchaseRef?: string;
  amount: number;
}

export interface AgreementRemisionGuia {
  serie: string;
  correlativo: string;
  fecha: string;
}

export interface AgreementInstallment {
  id?: string;
  amount: number;
  dueDate: Date;
  status: 'PENDING' | 'PAID';
  paidDate?: Date;
  voucherUrl?: string;
}

export interface AgreementPayment {
  id?: string;
  amount: number;
  paymentDate: Date;
  codigoTransferencia: string;
  notes?: string;
  registeredBy?: string;
  registeredByName?: string;
}

export interface PaymentAgreementEntity {
  id?: string;
  supplier: string;
  invoices: AgreementInvoice[];
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  status: 'PENDING' | 'PARTIAL' | 'PAID' | 'CANCELLED';
  paymentScheduleType: 'SINGLE_DATE' | 'INSTALLMENTS';
  currency?: 'PEN' | 'USD';
  dueDate?: Date;
  installments: AgreementInstallment[];
  payments: AgreementPayment[];
  documentType?: 'FACTURA' | 'BOLETA';
  documentSeries?: string;
  documentNumber?: string;
  remisionGuia?: AgreementRemisionGuia;
  notes?: string;
  cancellationReason?: string;
  cancelledBy?: string;
  cancelledAt?: Date;
  createdBy?: string;
  createdAt?: Date;
}
