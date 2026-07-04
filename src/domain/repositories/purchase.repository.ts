import { PurchaseEntity, PurchaseItemEntity, ReceptionEntity } from '../entities/purchase.entity';

export interface IPurchaseRepository {
  create(purchase: PurchaseEntity): Promise<PurchaseEntity>;
  findAll(filter?: { companyId?: string; startDate?: Date; endDate?: Date }, page?: number, limit?: number): Promise<{ data: PurchaseEntity[]; total: number }>;
  findById(id: string): Promise<PurchaseEntity | null>;
  registerReception(id: string, reception: ReceptionEntity): Promise<PurchaseEntity | null>;
  updateRemisionGuia(id: string, data: { serie: string; correlativo: string; fecha: Date }): Promise<PurchaseEntity | null>;
  update(id: string, data: Partial<PurchaseEntity>): Promise<PurchaseEntity | null>;
  updateItem(id: string, productId: string, data: Partial<PurchaseItemEntity>): Promise<PurchaseEntity | null>;
  addItem(id: string, item: PurchaseItemEntity): Promise<PurchaseEntity | null>;
  addBonificationItem(id: string, item: PurchaseItemEntity): Promise<PurchaseEntity | null>;
  delete(id: string): Promise<void>;
}

export const PURCHASE_REPOSITORY = 'PURCHASE_REPOSITORY';
