export interface LoanItemEntity {
  productId: string;
  productName?: string;
  companyId: string;
  companyName?: string;
  quantity: number;
  returnedQuantity: number;
}

export interface LoanReturnItemEntity {
  productId: string;
  productName?: string;
  companyId: string;
  companyName?: string;
  quantity: number;
}

export interface LoanReturnEntity {
  id?: string;
  items: LoanReturnItemEntity[];
  notes?: string;
  returnedBy?: string;
  date: Date;
}

export interface LoanEntity {
  id?: string;
  borrowerName: string;
  items: LoanItemEntity[];
  status: 'ACTIVE' | 'PARTIAL' | 'RETURNED';
  returns: LoanReturnEntity[];
  notes?: string;
  date: Date;
  createdBy?: string;
  createdAt?: Date;
}
