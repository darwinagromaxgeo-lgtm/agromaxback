import { BillingDocumentEntity, BillingDocumentStatus, BillingDocumentType, BillingPartySnapshot, BillingSubmissionResult, BillingTaxType } from '../entities/billing-document.entity';

export interface BillingDocumentFilter {
  branchId: string;
  companyId?: string;
  saleId?: string;
  saleIds?: string[];
  documentType?: BillingDocumentType;
  status?: BillingDocumentStatus;
  startDate?: Date;
  endDate?: Date;
}

export interface IBillingDocumentRepository {
  findAll(filter: BillingDocumentFilter, page: number, limit: number): Promise<{ data: BillingDocumentEntity[]; total: number }>;
  findById(id: string, branchId: string): Promise<BillingDocumentEntity | null>;
  findForSale(saleId: string, companyId: string, taxType: BillingTaxType, branchId: string): Promise<BillingDocumentEntity | null>;
  findCancelledForSale(saleId:string,companyId:string,taxType:BillingTaxType,branchId:string): Promise<BillingDocumentEntity | null>;
  hasSubmittedSale(saleId: string): Promise<boolean>;
  hasActiveSale(saleId: string): Promise<boolean>;
  createDraft(document: BillingDocumentEntity): Promise<BillingDocumentEntity>;
  discard(id: string, branchId: string, reason: string, userId: string): Promise<BillingDocumentEntity | null>;
  claimDraft(id: string, branchId: string, userId: string, receiverRevision?: number): Promise<BillingDocumentEntity | null>;
  updateReceiver(id: string, branchId: string, receiver: BillingPartySnapshot, userId: string, expectedRevision: number): Promise<BillingDocumentEntity | null>;
  reserveNumber(issuerRuc: string, series: string, environment: string, startNumber: number, maxNumber?: number): Promise<number>;
  setSubmission(id: string, branchId: string, data: Pick<BillingDocumentEntity, 'series' | 'number' | 'environment' | 'issuer' | 'summaryNumber' | 'summaryDate' | 'boletaSubmissionMode'>): Promise<void>;
  saveSubmissionResult(id: string, branchId: string, result: BillingSubmissionResult): Promise<BillingDocumentEntity>;
  getArtifact(id: string, branchId: string, format: 'pdf' | 'xml' | 'cdr'): Promise<{ data: string; filename: string } | null>;
}

export const BILLING_DOCUMENT_REPOSITORY = 'BILLING_DOCUMENT_REPOSITORY';
