import { SupplierEntity } from '../entities/supplier.entity';

export interface ISupplierRepository {
  create(supplier: SupplierEntity): Promise<SupplierEntity>;
  findAll(filter?: { search?: string; isActive?: boolean }, page?: number, limit?: number): Promise<{ data: SupplierEntity[]; total: number }>;
  findById(id: string): Promise<SupplierEntity | null>;
  findByRuc(ruc: string): Promise<SupplierEntity | null>;
  update(id: string, supplier: Partial<SupplierEntity>): Promise<SupplierEntity | null>;
}

export const SUPPLIER_REPOSITORY = 'SUPPLIER_REPOSITORY';
