import { BillingDocumentEntity, BillingProviderStatus, BillingServiceSimulation, BillingSubmissionResult } from '../entities/billing-document.entity';
import { BillingCreditNoteEntity } from '../entities/billing-credit-note.entity';

export interface IBillingProvider {
  getCreditNoteNumberingStart(type:'FACTURA'|'BOLETA'): number;
  submitCreditNote(document:BillingCreditNoteEntity): Promise<BillingSubmissionResult>;
  checkCreditNoteStatus(document:BillingCreditNoteEntity): Promise<BillingSubmissionResult>;
  getStatus(branchSeriesCode?: string, establishmentCode?: string): Promise<BillingProviderStatus>;
  getNumberingStart(documentType: 'FACTURA' | 'BOLETA' | 'SUMMARY'): number;
  getSummaryNumberLimit?(): number;
  submit(document: BillingDocumentEntity): Promise<BillingSubmissionResult>;
  checkStatus(document: BillingDocumentEntity): Promise<BillingSubmissionResult>;
  simulate?(document: BillingDocumentEntity): Promise<BillingServiceSimulation>;
}

export const BILLING_PROVIDER = 'BILLING_PROVIDER';
