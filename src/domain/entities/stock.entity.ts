export interface StockEntity {
  id?: string;
  productId: string;
  companyId: string;
  quantity: number;
  lastUpdated: Date;
}
