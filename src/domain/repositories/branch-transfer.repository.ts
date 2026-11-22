import { BranchTransferCommand, BranchTransferEntity } from '../entities/branch-transfer.entity';

export const BRANCH_TRANSFER_REPOSITORY = 'BRANCH_TRANSFER_REPOSITORY';
export interface IBranchTransferRepository {
  transfer(command: BranchTransferCommand, userId: string): Promise<BranchTransferEntity>;
  findByRequest(requestId: string, userId: string): Promise<BranchTransferEntity | null>;
  findAll(branchId: string | undefined, page: number, limit: number): Promise<{ data: BranchTransferEntity[]; total: number }>;
}
