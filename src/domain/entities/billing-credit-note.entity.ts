import { BillingDocumentEntity, BillingDocumentType, BillingItemSnapshot } from './billing-document.entity';

export interface BillingCreditNoteItem extends BillingItemSnapshot { originalItemIndex: number; }
export interface BillingCreditNoteEntity extends Omit<BillingDocumentEntity, 'documentType' | 'items'> {
  documentType: 'NOTA_CREDITO';
  originalDocumentId: string;
  originalDocumentType: BillingDocumentType;
  originalSeries: string;
  originalNumber: number;
  originalIssuedAt: Date;
  reasonCode: '01' | '06' | '07';
  reasonDescription: string;
  items: BillingCreditNoteItem[];
}
export interface CreditNoteRequest {
  returnType: 'CANCEL' | 'TOTAL' | 'PARTIAL';
  cancelSaleOnAcceptance?: boolean;
  reason: string;
  items?: { itemIndex: number; quantity: number }[];
}
