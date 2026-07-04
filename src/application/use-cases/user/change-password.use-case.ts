import { Injectable, Inject, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { IUserRepository, USER_REPOSITORY } from '../../../domain/repositories/user.repository';
import { ChangePasswordDto } from '../../dtos/user/change-password.dto';

@Injectable()
export class ChangePasswordUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
  ) {}

  async execute(targetUserId: string, dto: ChangePasswordDto, requestingUser: { id: string; role: string }) {
    const user = await this.userRepository.findById(targetUserId);
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const isSelf = requestingUser.id === targetUserId;
    const isAdmin = requestingUser.role === 'ADMIN';

    if (!isSelf && !isAdmin) {
      throw new ForbiddenException('No tiene permisos para cambiar esta contrasena');
    }

    if (isSelf) {
      if (!dto.currentPassword) {
        throw new BadRequestException('Debe proporcionar la contrasena actual');
      }
      const isValid = await bcrypt.compare(dto.currentPassword, user.password);
      if (!isValid) {
        throw new BadRequestException('La contrasena actual es incorrecta');
      }
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.userRepository.update(targetUserId, { password: hashedPassword });

    return { message: 'Contrasena actualizada correctamente' };
  }
}
