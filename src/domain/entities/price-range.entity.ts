export interface PriceTierEntity {
  id?: string;
  name: string;
  description?: string;
  priority: number;
  isActive: boolean;
  createdAt?: Date;
}
