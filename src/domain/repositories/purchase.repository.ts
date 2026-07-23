import { PurchaseEntity, PurchaseItemEntity, ReceptionEntity } from '../entities/purchase.entity';

export interface IPurchaseRepository {
  create(purchase: PurchaseEntity): Promise<PurchaseEntity>;
  findAll(filter?: { branchId?: string; companyId?: string; startDate?: Date; endDate?: Date }, page?: number, limit?: number): Promise<{ data: PurchaseEntity[]; total: number }>;
  findById(id: string, branchId?: string): Promise<PurchaseEntity | null>;
  registerReception(id: string, reception: ReceptionEntity, branchId?: string): Promise<PurchaseEntity | null>;
  updateRemisionGuia(id: string, data: { serie: string; correlativo: string; fecha: Date }, branchId?: string): Promise<PurchaseEntity | null>;
  update(id: string, data: Partial<PurchaseEntity>, branchId?: string): Promise<PurchaseEntity | null>;
  updateItem(id: string, productId: string, data: Partial<PurchaseItemEntity>, branchId?: string): Promise<PurchaseEntity | null>;
  addItem(id: string, item: PurchaseItemEntity, branchId?: string): Promise<PurchaseEntity | null>;
  addBonificationItem(id: string, item: PurchaseItemEntity, branchId?: string): Promise<PurchaseEntity | null>;
  delete(id: string, branchId?: string): Promise<void>;
}

export const PURCHASE_REPOSITORY = 'PURCHASE_REPOSITORY';
