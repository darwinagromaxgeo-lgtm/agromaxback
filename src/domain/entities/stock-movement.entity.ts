export interface StockMovementEntity {
  id?: string;
  productId: string;
  productName?: string;
  companyId: string;
  branchId?: string;
  movementType: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  referenceId?: string;
  referenceType?: string;
  description: string;
  userId?: string;
  date: Date;
  createdAt?: Date;
}
