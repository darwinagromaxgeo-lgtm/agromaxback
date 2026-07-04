import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { ICashRegisterRepository, CASH_REGISTER_REPOSITORY } from '../../../domain/repositories/cash-register.repository';
import { AddEntryDto } from '../../dtos/cash-register/add-entry.dto';

@Injectable()
export class AddEntryUseCase {
  constructor(
    @Inject(CASH_REGISTER_REPOSITORY) private readonly cashRegisterRepository: ICashRegisterRepository,
  ) {}

  async execute(registerId: string, dto: AddEntryDto, userId?: string) {
    const register = await this.cashRegisterRepository.findById(registerId);
    if (!register) throw new BadRequestException('Caja registradora no encontrada');
    if (register.status === 'CLOSED') throw new BadRequestException('La caja está cerrada');

    return this.cashRegisterRepository.addEntry(registerId, {
      type: dto.type,
      category: dto.category,
      description: dto.description,
      amount: dto.amount,
      referenceId: dto.referenceId || undefined,
      referenceType: dto.referenceType || undefined,
      voucherType: dto.voucherType || 'NONE',
      voucherSeries: dto.voucherSeries || undefined,
      voucherNumber: dto.voucherNumber || undefined,
      remisionGuia: dto.remisionGuia
        ? { serie: dto.remisionGuia.serie, correlativo: dto.remisionGuia.correlativo, fecha: new Date(dto.remisionGuia.fecha) }
        : undefined,
      isDeleted: false,
      editHistory: [],
      createdBy: userId || undefined,
    });
  }
}
