export interface StockTransferItemEntity {
  productId: string;
  quantity: number;
}

export interface StockTransferEntity {
  id?: string;
  fromCompanyId: string;
  toCompanyId: string;
  items: StockTransferItemEntity[];
  notes?: string;
  transferredBy: string;
  date: Date;
  createdAt?: Date;
}
