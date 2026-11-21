export interface ProductPrice {
  priceTierId: string;
  companyId?: string;
  branchId?: string;
  price: number;
}

export interface ActiveIngredientItem {
  name: string;
  concentration?: string;
}

export interface ProductCatalogImport {
  deduplication?: {
    canonicalProductId: string;
    canonicalSku?: string;
    inventoryConsolidated?: boolean;
    batch?: string;
  };
  key: string;
  branchId: string;
  branchName: string;
  sourceFile: string;
  sourceDate: string;
  presentation: string;
  sources: string[];
  pendingCategoryId: string;
  taxProposal?: string;
  taxConfiguration?: 'PROVISIONAL_GRAVADO' | 'SOURCE_EXCEL';
  format?: 'SAUSAL_EXPORT';
  sourceSku?: string;
  baseSalePrice?: number;
  offerSalePrice?: number;
  offerActive?: boolean;
  sourceStock?: number;
  sourceGeneralStock?: number;
  stockStatus?: 'IMPORTED' | 'IMPORTED_INACTIVE' | 'PENDING_NEGATIVE' | 'INACTIVE_SOURCE';
  originalExportRow?: Record<string, string | number>;
  reviewNotes: string[];
  originalRows: { source: string; quantity: string; lot: string; expiration: string; state: string; notes: string }[];
}

export interface ProductEntity {
  id?: string;
  name: string;
  description?: string;
  categoryId: string;
  unit: string;
  activeIngredient?: string;
  activeIngredients?: ActiveIngredientItem[];
  taxType?: string;
  catalogStatus?: 'READY' | 'PENDING_REVIEW';
  catalogImport?: ProductCatalogImport;
  prices: ProductPrice[];
  tracksLot?: boolean;
  isActive: boolean;
  minSalePrice?: number;
  minMarginPercent?: number;
  location?: string;
  locations?: string[];
  supplier?: string;
  control?: string;
  cultivo?: string;
  dosis?: string;
  imageUrl?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
