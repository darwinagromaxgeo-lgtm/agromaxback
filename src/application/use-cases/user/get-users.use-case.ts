import { Injectable, Inject } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../../domain/repositories/user.repository';
import { FilterUserDto } from '../../dtos/user/filter-user.dto';

@Injectable()
export class GetUsersUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
  ) {}

  async execute(filter: FilterUserDto) {
    return this.userRepository.findAll(
      { search: filter.search, role: filter.role, isActive: filter.isActive },
      filter.page,
      filter.limit,
    );
  }
}
