import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { UpdateClientDto } from '../../dtos/client/update-client.dto';
import {
  CLIENT_REPOSITORY,
  IClientRepository,
} from '../../../domain/repositories/client.repository';

@Injectable()
export class UpdateClientUseCase {
  constructor(
    @Inject(CLIENT_REPOSITORY)
    private readonly clientRepository: IClientRepository,
  ) {}

  async execute(id: string, dto: UpdateClientDto) {
    const client = await this.clientRepository.findById(id);
    if (!client) {
      throw new NotFoundException('Cliente no encontrado en la sucursal activa');
    }

    const documentNumber = dto.documentNumber?.trim() || undefined;
    if (documentNumber && documentNumber !== client.documentNumber) {
      const duplicate = await this.clientRepository.findByDocumentNumber(documentNumber);
      if (duplicate && duplicate.id !== id) {
        throw new ConflictException('El número de documento ya está registrado en esta sucursal');
      }
    }

    return this.clientRepository.update(id, {
      ...dto,
      ...(dto.documentNumber !== undefined ? { documentNumber } : {}),
    });
  }
}
