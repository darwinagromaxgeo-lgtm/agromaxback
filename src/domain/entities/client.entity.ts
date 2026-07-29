export interface ClientEntity {
  id?: string;
  branchId: string;
  name: string;
  documentNumber?: string;
  phone?: string;
  email?: string;
  address?: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
