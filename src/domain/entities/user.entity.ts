export interface UserBranchAssignment {
  branchId: string;
  role: string;
}

export interface UserEntity {
  id?: string;
  username: string;
  email?: string;
  password: string;
  fullName: string;
  role: string;
  branchAssignments?: UserBranchAssignment[];
  canTransferStock?: boolean;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
