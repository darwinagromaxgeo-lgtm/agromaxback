import { Injectable, ConflictException, Inject } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { IUserRepository, USER_REPOSITORY } from '../../../domain/repositories/user.repository';

@Injectable()
export class RegisterUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository) {}

  async execute(username: string, password: string, fullName: string, role = 'VENDEDOR', email?: string) {
    const existing = await this.userRepository.findByUsername(username);
    if (existing) throw new ConflictException('El nombre de usuario ya está registrado');
    if (email) {
      const existingEmail = await this.userRepository.findByEmail(email);
      if (existingEmail) throw new ConflictException('El email ya está registrado');
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await this.userRepository.create({ username, email, password: hashedPassword, fullName, role, isActive: true });
    return { id: user.id, username: user.username, email: user.email, fullName: user.fullName, role: user.role };
  }
}
