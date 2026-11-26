import { BadRequestException, Injectable, Inject, ConflictException } from '@nestjs/common';
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
    const role = dto.role || 'VENDEDOR';
    if (role !== 'ADMIN' && (!dto.branchAssignments || dto.branchAssignments.length === 0)) {
      throw new BadRequestException('Asigna al menos una sucursal al usuario');
    }
    const user = await this.userRepository.create({
      username: dto.username,
      email: dto.email,
      password: hashedPassword,
      fullName: dto.fullName,
      role,
      canTransferStock: role === 'VENDEDOR' && dto.canTransferStock === true,
      branchAssignments: role === 'ADMIN' ? [] : dto.branchAssignments,
      isActive: true,
    });

    return { id: user.id, username: user.username, email: user.email, fullName: user.fullName, role: user.role, branchAssignments: user.branchAssignments, canTransferStock: user.canTransferStock === true, isActive: user.isActive };
  }
}
