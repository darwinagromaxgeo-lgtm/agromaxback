export interface BranchTransferCommand {
  requestId: string;
  fromBranchId: string;
  toBranchId: string;
  companyId: string;
  items: { productId: string; quantity: number }[];
  notes?: string;
}

export interface BranchTransferEntity {
  id: string;
  reference: string;
  fromBranchId: string;
  fromBranchName: string;
  toBranchId: string;
  toBranchName: string;
  companyId: string;
  companyName: string;
  status: 'COMPLETED';
  items: {
    productId: string; productName: string; unit: string; quantity: number;
    sourcePrevious: number; sourceCurrent: number; destinationPrevious: number; destinationCurrent: number;
    lots: { lotNumber: string; quantity: number; expirationDate?: Date }[];
  }[];
  notes?: string;
  transferredBy: string;
  transferredByName: string;
  createdAt: Date;
}
