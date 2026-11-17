import { BillingDocumentEntity, BillingProviderStatus, BillingServiceSimulation, BillingSubmissionResult } from '../entities/billing-document.entity';

export interface IBillingProvider {
  getStatus(branchSeriesCode?: string, establishmentCode?: string): Promise<BillingProviderStatus>;
  getNumberingStart(documentType: 'FACTURA' | 'BOLETA' | 'SUMMARY'): number;
  getSummaryNumberLimit?(): number;
  submit(document: BillingDocumentEntity): Promise<BillingSubmissionResult>;
  checkStatus(document: BillingDocumentEntity): Promise<BillingSubmissionResult>;
  simulate?(document: BillingDocumentEntity): Promise<BillingServiceSimulation>;
}

export const BILLING_PROVIDER = 'BILLING_PROVIDER';
