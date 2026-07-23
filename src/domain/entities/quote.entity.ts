export interface QuoteItemEntity {
  productId: string;
  companyId: string;
  quantity: number;
  priceTier: string;
  unitPrice: number;
  subtotal: number;
}

export type QuoteStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CONVERTED';

export interface QuoteEntity {
  id?: string;
  branchId?: string;
  quoteNumber?: string;
  series?: string;
  number?: number;
  companyId?: string;
  clientId?: string;
  clientName?: string;
  items: QuoteItemEntity[];
  total: number;
  notes?: string;
  status: QuoteStatus;
  issueDate: Date;
  validUntil: Date;
  convertedSaleId?: string;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
