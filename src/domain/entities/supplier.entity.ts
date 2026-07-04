export interface SupplierEntity {
  id?: string;
  ruc: string;
  businessName: string;
  address?: string;
  phone?: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
