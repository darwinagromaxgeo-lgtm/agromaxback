export interface StockEntity {
  id?: string;
  productId: string;
  companyId: string;
  branchId?: string;
  quantity: number;
  lastUpdated: Date;
}
