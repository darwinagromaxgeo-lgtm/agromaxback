import { LoanEntity } from '../entities/loan.entity';

export interface ILoanRepository {
  create(loan: LoanEntity): Promise<LoanEntity>;
  findById(id: string, branchId?: string): Promise<LoanEntity | null>;
  findAll(
    filter?: { branchId?: string; borrowerName?: string; status?: string; startDate?: Date; endDate?: Date },
    page?: number,
    limit?: number,
  ): Promise<{ data: LoanEntity[]; total: number }>;
  update(id: string, data: Partial<LoanEntity>, branchId?: string): Promise<LoanEntity | null>;
  addReturn(id: string, returnData: any, branchId?: string): Promise<LoanEntity | null>;
}

export const LOAN_REPOSITORY = 'LOAN_REPOSITORY';
