import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { ICashRegisterRepository, CASH_REGISTER_REPOSITORY } from '../../../domain/repositories/cash-register.repository';
import { CloseRegisterDto } from '../../dtos/cash-register/close-register.dto';

@Injectable()
export class CloseCashRegisterUseCase {
  constructor(
    @Inject(CASH_REGISTER_REPOSITORY) private readonly cashRegisterRepository: ICashRegisterRepository,
  ) {}

  async execute(registerId: string, dto: CloseRegisterDto, userId?: string) {
    const register = await this.cashRegisterRepository.findById(registerId);
    if (!register) throw new BadRequestException('Caja registradora no encontrada');
    if (register.status === 'CLOSED') throw new BadRequestException('La caja ya está cerrada');

    const activeEntries = register.entries.filter(e => !e.isDeleted);
    const totalIncome = activeEntries.filter(e => e.type === 'INCOME').reduce((sum, e) => sum + e.amount, 0);
    const totalExpense = activeEntries.filter(e => e.type === 'EXPENSE').reduce((sum, e) => sum + e.amount, 0);
    const closingBalance = register.openingBalance + totalIncome - totalExpense;

    return this.cashRegisterRepository.update(registerId, {
      status: 'CLOSED',
      closingBalance: Math.round(closingBalance * 100) / 100,
      closedBy: userId,
      closedAt: new Date(),
      notes: dto.notes,
    });
  }
}
