import { Injectable, Inject, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { IUserRepository, USER_REPOSITORY } from '../../../domain/repositories/user.repository';
import { CreateUserDto } from '../../dtos/user/create-user.dto';

@Injectable()
export class CreateUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
  ) {}

  async execute(dto: CreateUserDto) {
    const existingUsername = await this.userRepository.findByUsername(dto.username);
    if (existingUsername) throw new ConflictException('El nombre de usuario ya esta registrado');

    if (dto.email) {
      const existingEmail = await this.userRepository.findByEmail(dto.email);
      if (existingEmail) throw new ConflictException('El email ya esta registrado');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = await this.userRepository.create({
      username: dto.username,
      email: dto.email,
      password: hashedPassword,
      fullName: dto.fullName,
      role: dto.role || 'VENDEDOR',
      isActive: true,
    });

    return { id: user.id, username: user.username, email: user.email, fullName: user.fullName, role: user.role, isActive: user.isActive };
  }
}
