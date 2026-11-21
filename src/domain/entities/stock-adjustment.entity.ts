export type StockAdjustmentMovementKind = 'ENTRY' | 'EXIT' | 'WASTE' | 'COUNT';

export interface StockAdjustmentEntity {
  id?: string;
  productId: string;
  companyId: string;
  branchId?: string;
  type: 'INCREASE' | 'DECREASE';
  mode?: 'INCREASE' | 'DECREASE' | 'SET';
  movementKind?: StockAdjustmentMovementKind;
  targetQuantity?: number;
  requestId?: string;
  quantity: number;
  reason: string;
  previousQuantity: number;
  newQuantity: number;
  adjustedBy?: string;
  date: Date;
  createdAt?: Date;
}
