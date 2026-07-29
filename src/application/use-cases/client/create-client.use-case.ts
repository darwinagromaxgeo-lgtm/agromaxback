import { Injectable, Inject, ConflictException } from '@nestjs/common';
import { IClientRepository, CLIENT_REPOSITORY } from '../../../domain/repositories/client.repository';
import { CreateClientDto } from '../../dtos/client/create-client.dto';

@Injectable()
export class CreateClientUseCase {
  constructor(@Inject(CLIENT_REPOSITORY) private readonly clientRepository: IClientRepository) {}

  async execute(dto: CreateClientDto, branchId: string) {
    const documentNumber = dto.documentNumber?.trim() || undefined;
    if (documentNumber) {
      const existing = await this.clientRepository.findByDocumentNumber(documentNumber);
      if (existing) {
        throw new ConflictException('El número de documento ya está registrado en esta sucursal');
      }
    }
    return this.clientRepository.create({
      ...dto,
      documentNumber,
      branchId,
      isActive: true,
    });
  }
}
