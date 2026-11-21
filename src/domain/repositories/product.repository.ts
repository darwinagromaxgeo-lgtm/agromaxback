import { ProductEntity } from '../entities/product.entity';

export interface IProductRepository {
  create(product: ProductEntity): Promise<ProductEntity>;
  findAll(filter?: { search?: string; category?: string; activeIngredient?: string; control?: string; isActive?: boolean; billingEnabled?: boolean; sellableOnly?: boolean; supplier?: string; unit?: string; sort?: 'asc' | 'desc' }, page?: number, limit?: number): Promise<{ data: ProductEntity[]; total: number }>;
  findById(id: string): Promise<ProductEntity | null>;
  findByName(name: string): Promise<ProductEntity | null>;
  update(id: string, product: Partial<ProductEntity>): Promise<ProductEntity | null>;
  delete(id: string): Promise<void>;
}

export const PRODUCT_REPOSITORY = 'PRODUCT_REPOSITORY';
