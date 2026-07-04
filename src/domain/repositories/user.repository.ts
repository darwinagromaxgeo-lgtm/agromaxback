import { UserEntity } from '../entities/user.entity';

export interface IUserRepository {
  create(user: UserEntity): Promise<UserEntity>;
  findByEmail(email: string): Promise<UserEntity | null>;
  findByUsername(username: string): Promise<UserEntity | null>;
  findById(id: string): Promise<UserEntity | null>;
  findAll(filter?: { search?: string; role?: string; isActive?: boolean }, page?: number, limit?: number): Promise<{ data: UserEntity[]; total: number }>;
  update(id: string, data: Partial<UserEntity>): Promise<UserEntity>;
}

export const USER_REPOSITORY = 'USER_REPOSITORY';
