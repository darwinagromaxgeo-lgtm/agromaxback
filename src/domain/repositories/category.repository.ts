import { CategoryEntity } from '../entities/category.entity';

export interface ICategoryRepository {
  create(category: CategoryEntity): Promise<CategoryEntity>;
  findAll(): Promise<CategoryEntity[]>;
  findById(id: string): Promise<CategoryEntity | null>;
  findByName(name: string): Promise<CategoryEntity | null>;
  findByNameAndParent(name: string, parentId: string | null): Promise<CategoryEntity | null>;
  update(id: string, category: Partial<CategoryEntity>): Promise<CategoryEntity | null>;
  delete(id: string): Promise<void>;
}

export const CATEGORY_REPOSITORY = 'CATEGORY_REPOSITORY';
