export interface UserEntity {
  id?: string;
  username: string;
  email?: string;
  password: string;
  fullName: string;
  role: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
