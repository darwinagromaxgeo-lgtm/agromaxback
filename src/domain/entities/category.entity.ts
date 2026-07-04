export interface CategoryEntity {
  id?: string;
  name: string;
  description?: string;
  isActive: boolean;
  parentId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
