import { Injectable, Inject, ConflictException } from '@nestjs/common';
import { IClientRepository, CLIENT_REPOSITORY } from '../../../domain/repositories/client.repository';
import { CreateClientDto } from '../../dtos/client/create-client.dto';

@Injectable()
export class CreateClientUseCase {
  constructor(@Inject(CLIENT_REPOSITORY) private readonly clientRepository: IClientRepository) {}

  async execute(dto: CreateClientDto) {
    if (dto.documentNumber) {
      const existing = await this.clientRepository.findByDocumentNumber(dto.documentNumber);
      if (existing) throw new ConflictException('El número de documento ya está registrado');
    }
    return this.clientRepository.create({ ...dto, isActive: true });
  }
}
