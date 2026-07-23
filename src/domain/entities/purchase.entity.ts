export interface PurchaseItemEntity {
  productId: string;
  productName?: string;
  quantity: number;
  receivedQty?: number;
  unitCost?: number;
  unitPriceSinIgv?: number;
  unitPriceConIgv?: number;
  flete?: number;
  otrosCostos?: number;
  precioVenta?: number;
  precioMinorista?: number;
  precioEspecial?: number;
  markupPercent?: number;
  markupMinoristaPercent?: number;
  markupEspecialPercent?: number;
  minMarginPercent?: number;
  lotNumber?: string;
  expirationDate?: Date;
  taxType?: string;
}

export interface ReceptionItemEntity {
  productId: string;
  productName?: string;
  quantity: number;
}

export interface ReceptionEntity {
  id?: string;
  date: Date;
  receivedBy?: string;
  receivedByName?: string;
  notes?: string;
  items: ReceptionItemEntity[];
}

export interface PurchaseInstallmentInput {
  amount: number;
  dueDate: Date;
}

export type PurchaseDocumentType = 'FACTURA' | 'BOLETA' | 'GUIA' | 'NOTA_CREDITO' | 'OTRO';
export type PurchaseReceptionStatus = 'PENDING' | 'PARTIAL' | 'RECEIVED';

export interface PurchaseEntity {
  id?: string;
  branchId?: string;
  companyId: string;
  supplier: string;
  items: PurchaseItemEntity[];
  bonificationItems?: PurchaseItemEntity[];
  totalCost: number;
  receptionStatus?: PurchaseReceptionStatus;
  receptions?: ReceptionEntity[];
  paymentType: 'CONTADO' | 'CREDITO' | 'PENDIENTE_ACUERDO';
  paymentScheduleType?: 'SINGLE_DATE' | 'INSTALLMENTS';
  dueDate?: Date;
  installments?: PurchaseInstallmentInput[];
  date: Date;
  supplierId?: string;
  supplierRuc?: string;
  totalCostUsd?: number;
  exchangeRate?: number;
  documentType?: PurchaseDocumentType;
  documentSeries?: string;
  documentNumber?: string;
  issueDate?: Date;
  remisionGuia?: { serie: string; correlativo: string; fecha: Date };
  isHistorical?: boolean;
  createdBy?: string;
  createdAt?: Date;
}
