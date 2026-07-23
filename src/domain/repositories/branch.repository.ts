import { BranchEntity } from '../entities/branch.entity';

export interface IBranchRepository {
  create(branch: BranchEntity): Promise<BranchEntity>;
  findAll(activeOnly?: boolean): Promise<BranchEntity[]>;
  findById(id: string): Promise<BranchEntity | null>;
  findByCode(code: string): Promise<BranchEntity | null>;
  findByIds(ids: string[], activeOnly?: boolean): Promise<BranchEntity[]>;
  update(id: string, data: Partial<BranchEntity>): Promise<BranchEntity | null>;
}

export const BRANCH_REPOSITORY = 'BRANCH_REPOSITORY';
