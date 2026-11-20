import { Injectable, Inject, BadRequestException, ConflictException } from '@nestjs/common';
import { ICashRegisterRepository, CASH_REGISTER_REPOSITORY } from '../../../domain/repositories/cash-register.repository';
import { CloseRegisterDto } from '../../dtos/cash-register/close-register.dto';
import { summarizeCash } from '../../../shared/utils/cash-summary';

@Injectable()
export class CloseCashRegisterUseCase {
  constructor(
    @Inject(CASH_REGISTER_REPOSITORY) private readonly cashRegisterRepository: ICashRegisterRepository,
  ) {}

  async execute(registerId: string, dto: CloseRegisterDto, userId?: string) {
    const register = await this.cashRegisterRepository.findById(registerId);
    if (!register) throw new BadRequestException('Caja registradora no encontrada');
    if (register.status === 'CLOSED') throw new BadRequestException('La caja ya está cerrada');

    if ((register.revision || 0) !== dto.expectedRevision) throw new ConflictException('Hay nuevos movimientos en la caja. Actualiza y revisa el arqueo antes de cerrar');
    const summary = summarizeCash(register.openingBalance, register.entries);
    if (summary.unclassifiedCount) throw new BadRequestException('Identifica el método de pago de todos los movimientos antes de cerrar');
    const difference = (Math.round(dto.countedCash * 100) - Math.round(summary.expectedCash * 100)) / 100;
    if (difference !== 0 && (!dto.notes || dto.notes.trim().length < 5)) throw new BadRequestException('Explica el faltante o sobrante del arqueo (mínimo 5 caracteres)');

    const closed = await this.cashRegisterRepository.closeIfUnchanged(registerId, dto.expectedRevision, {
      status: 'CLOSED',
      closingBalance: summary.balance,
      cashCount: { expectedAmount: summary.expectedCash, countedAmount: dto.countedCash, difference, methods: summary.methods },
      closedBy: userId,
      closedAt: new Date(),
      notes: dto.notes?.trim(),
    });
    if (!closed) throw new ConflictException('La caja cambió durante el cierre. Actualiza y revisa el arqueo');
    return closed;
  }
}
