import { Injectable, Inject } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../../domain/repositories/user.repository';

@Injectable()
export class ValidateTokenUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository) {}

  async execute(userId: string) {
    const user = await this.userRepository.findById(userId);
    if (!user || !user.isActive) return null;
    return { id: user.id, username: user.username, email: user.email, fullName: user.fullName, role: user.role, branchAssignments: user.branchAssignments || [] };
  }
}
