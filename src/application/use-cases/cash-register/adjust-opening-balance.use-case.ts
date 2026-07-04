import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { ICashRegisterRepository, CASH_REGISTER_REPOSITORY } from '../../../domain/repositories/cash-register.repository';
import { AdjustOpeningBalanceDto } from '../../dtos/cash-register/adjust-opening-balance.dto';

@Injectable()
export class AdjustOpeningBalanceUseCase {
  constructor(
    @Inject(CASH_REGISTER_REPOSITORY) private readonly cashRegisterRepository: ICashRegisterRepository,
  ) {}

  async execute(registerId: string, dto: AdjustOpeningBalanceDto, userId?: string) {
    const register = await this.cashRegisterRepository.findById(registerId);
    if (!register) throw new BadRequestException('Caja registradora no encontrada');
    if (register.status === 'CLOSED') {
      throw new BadRequestException('No se puede ajustar el balance de apertura de una caja cerrada.');
    }

    if (dto.openingBalance === register.openingBalance) {
      throw new BadRequestException('El nuevo monto es igual al actual. No hay nada que ajustar.');
    }

    return this.cashRegisterRepository.adjustOpeningBalance(registerId, dto.openingBalance, {
      previousAmount: register.openingBalance,
      newAmount: dto.openingBalance,
      reason: dto.reason,
      adjustedBy: userId,
      adjustedAt: new Date(),
    });
  }
}
