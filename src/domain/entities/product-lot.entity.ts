export interface ProductLotEntity {
  id?: string;
  productId: string;
  companyId: string;
  branchId?: string;
  lotNumber: string;
  expirationDate?: Date;
  initialQuantity: number;
  currentQuantity: number;
  purchaseId?: string;
  receivedAt: Date;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
