import { Injectable, Inject, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../../domain/repositories/user.repository';
import { UpdateUserDto } from '../../dtos/user/update-user.dto';

@Injectable()
export class UpdateUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
  ) {}

  async execute(id: string, dto: UpdateUserDto) {
    const user = await this.userRepository.findById(id);
    if (!user) throw new NotFoundException('Usuario no encontrado');

    if (dto.username && dto.username !== user.username) {
      const existing = await this.userRepository.findByUsername(dto.username);
      if (existing) throw new ConflictException('El nombre de usuario ya esta registrado');
    }

    if (dto.email && dto.email !== user.email) {
      const existing = await this.userRepository.findByEmail(dto.email);
      if (existing) throw new ConflictException('El email ya esta registrado');
    }

    const role = dto.role || user.role;
    const branchAssignments = role === 'ADMIN' ? [] : (dto.branchAssignments ?? user.branchAssignments ?? []);
    if (role !== 'ADMIN' && !branchAssignments.length) throw new BadRequestException('Asigna al menos una sucursal al usuario');
    const updated = await this.userRepository.update(id, { ...dto, branchAssignments });
    const { password, ...result } = updated;
    return result;
  }
}
