export type BillingDocumentType = 'FACTURA' | 'BOLETA';
export type BillingDocumentStatus = 'DRAFT' | 'SENDING' | 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'UNKNOWN' | 'DISCARDED';
export type BillingTaxType = 'GRAVADO' | 'EXONERADO' | 'INAFECTO';

export interface BillingPartySnapshot {
  name: string;
  documentType: 'RUC' | 'DNI' | 'UNIDENTIFIED';
  documentNumber?: string;
  address?: string;
  establishmentCode?: string;
  email?: string;
}

export interface BillingItemSnapshot {
  productId: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  taxType: BillingTaxType;
  taxRate: number;
  baseAmount: number;
  taxAmount: number;
  total: number;
}

export interface BillingDocumentEntity {
  id?: string;
  branchId: string;
  companyId: string;
  saleId: string;
  documentType: BillingDocumentType;
  taxType: BillingTaxType;
  status: BillingDocumentStatus;
  currency: 'PEN';
  issuer: BillingPartySnapshot;
  receiver: BillingPartySnapshot;
  receiverRevision?: number;
  receiverUpdatedBy?: string;
  receiverUpdatedAt?: Date;
  items: BillingItemSnapshot[];
  taxableAmount: number;
  exemptAmount: number;
  unaffectedAmount: number;
  taxAmount: number;
  total: number;
  paymentCondition: 'CONTADO' | 'CREDITO';
  saleDate: Date;
  warnings: string[];
  legacyTaxData: boolean;
  createdBy?: string;
  createdAt?: Date;
  discardedBy?: string;
  discardedAt?: Date;
  discardReason?: string;
  series?: string;
  number?: number;
  environment?: 'beta' | 'production';
  submittedAt?: Date;
  submittedBy?: string;
  sunatCode?: string;
  sunatDescription?: string;
  hash?: string;
  hasPdf?: boolean;
  hasXml?: boolean;
  hasCdr?: boolean;
  ticket?: string;
  summaryNumber?: number;
  summaryDate?: string;
  boletaSubmissionMode?: 'individual' | 'summary';
  cancelledByCreditNoteId?: string;
  cancelledAt?: Date;
  cancellationReason?: string;
  replacesDocumentId?: string;
  reissueAfterCreditNoteId?: string;
  replacementDocumentId?: string;
}

export interface BillingSubmissionResult {
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'UNKNOWN';
  sunatCode?: string;
  sunatDescription: string;
  hash?: string;
  pdfBase64?: string;
  xmlBase64?: string;
  cdrBase64?: string;
  ticket?: string;
}

export interface BillingProviderStatus {
  configured: boolean;
  ready: boolean;
  environment?: 'simulation' | 'beta' | 'production';
  simulationReady?: boolean;
  issuerRuc?: string;
  issuerName?: string;
  issuerAddress?: string;
  issuerEstablishmentCode?: string;
  boletaSubmissionMode?: 'individual' | 'summary';
  series?: { FACTURA: string; BOLETA: string };
  supportedDocumentTypes: BillingDocumentType[];
  creditNotes?: { ready:boolean; cancellationReady?:boolean; series:{ FACTURA:string; BOLETA:string }; message:string };
  message: string;
}

export interface BillingSimulation {
  simulation: true;
  status: 'SIMULATED';
  document: BillingDocumentEntity;
  checks: { label: string; passed: boolean; detail: string }[];
  dataReady: boolean;
  message: string;
  service?: BillingServiceSimulation;
}

export interface BillingServiceSimulation {
  verified: boolean;
  message: string;
  pdfBase64?: string;
  xmlBase64?: string;
}
