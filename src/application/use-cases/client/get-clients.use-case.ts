import { Injectable, Inject } from '@nestjs/common';
import { IClientRepository, CLIENT_REPOSITORY } from '../../../domain/repositories/client.repository';
import { PaginationDto } from '../../dtos/common/pagination.dto';

@Injectable()
export class GetClientsUseCase {
  constructor(@Inject(CLIENT_REPOSITORY) private readonly clientRepository: IClientRepository) {}
  async execute(filter: PaginationDto) { return this.clientRepository.findAll({ search: filter.search, isActive: true }, filter.page, filter.limit); }
}
