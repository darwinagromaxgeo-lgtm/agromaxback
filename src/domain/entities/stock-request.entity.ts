export type StockRequestStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'DISPATCHING'
  | 'IN_TRANSIT'
  | 'RECEIVING'
  | 'RECEIVED'
  | 'CANCELLED';

export interface StockRequestLotAllocationEntity {
  lotNumber: string;
  expirationDate?: Date;
  quantity: number;
}

export interface StockRequestItemEntity {
  productId: string;
  productName?: string;
  requestedQuantity: number;
  approvedQuantity?: number;
  lotAllocations?: StockRequestLotAllocationEntity[];
}

export interface StockRequestEntity {
  id?: string;
  requestingBranchId: string;
  requestingBranchName?: string;
  sourceBranchId: string;
  sourceBranchName?: string;
  companyId: string;
  items: StockRequestItemEntity[];
  status: StockRequestStatus;
  notes?: string;
  rejectionReason?: string;
  requestedBy: string;
  requestedByName?: string;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: Date;
  dispatchedBy?: string;
  dispatchedByName?: string;
  dispatchedAt?: Date;
  receivedBy?: string;
  receivedByName?: string;
  receivedAt?: Date;
  cancelledBy?: string;
  cancelledAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}
