import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../../domain/repositories/user.repository';

@Injectable()
export class ToggleUserStatusUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
  ) {}

  async execute(targetUserId: string, requestingUserId: string) {
    if (targetUserId === requestingUserId) {
      throw new BadRequestException('No puede desactivar su propia cuenta');
    }

    const user = await this.userRepository.findById(targetUserId);
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const updated = await this.userRepository.update(targetUserId, { isActive: !user.isActive });
    const { password, ...result } = updated;
    return result;
  }
}
