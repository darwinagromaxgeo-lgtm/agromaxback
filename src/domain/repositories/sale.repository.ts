import { SaleEntity } from '../entities/sale.entity';

export interface ISaleRepository {
  create(sale: SaleEntity): Promise<SaleEntity>;
  findAll(filter?: { branchId?: string; companyId?: string; clientId?: string; startDate?: Date; endDate?: Date; voucherType?: string }, page?: number, limit?: number): Promise<{ data: SaleEntity[]; total: number; totalAmount: number; cancelledCount: number; totalBaseAmount?: number; totalIgv?: number }>;
  findById(id: string, branchId?: string): Promise<SaleEntity | null>;
  update(id: string, data: Partial<SaleEntity>, branchId?: string): Promise<SaleEntity | null>;
}

export const SALE_REPOSITORY = 'SALE_REPOSITORY';
