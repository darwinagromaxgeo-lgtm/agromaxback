export interface StockAdjustmentEntity {
  id?: string;
  productId: string;
  companyId: string;
  type: 'INCREASE' | 'DECREASE';
  quantity: number;
  reason: string;
  previousQuantity: number;
  newQuantity: number;
  adjustedBy?: string;
  date: Date;
  createdAt?: Date;
}
