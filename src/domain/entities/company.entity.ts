export interface CompanyEntity {
  id?: string;
  name: string;
  ruc: string;
  address?: string;
  phone?: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
