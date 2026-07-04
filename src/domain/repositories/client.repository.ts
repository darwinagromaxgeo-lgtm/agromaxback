import { ClientEntity } from '../entities/client.entity';

export interface IClientRepository {
  create(client: ClientEntity): Promise<ClientEntity>;
  findAll(filter?: { search?: string; isActive?: boolean }, page?: number, limit?: number): Promise<{ data: ClientEntity[]; total: number }>;
  findById(id: string): Promise<ClientEntity | null>;
  update(id: string, client: Partial<ClientEntity>): Promise<ClientEntity | null>;
  findByDocumentNumber(documentNumber: string): Promise<ClientEntity | null>;
}

export const CLIENT_REPOSITORY = 'CLIENT_REPOSITORY';
