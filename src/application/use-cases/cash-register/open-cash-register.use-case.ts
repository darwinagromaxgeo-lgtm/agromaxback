import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { ICashRegisterRepository, CASH_REGISTER_REPOSITORY } from '../../../domain/repositories/cash-register.repository';
import { OpenCashRegisterDto } from '../../dtos/cash-register/open-cash-register.dto';
import { CashRegisterStatus } from '../../../domain/enums';
import { getTodayDateString } from '../../../shared/utils/date.util';

@Injectable()
export class OpenCashRegisterUseCase {
  constructor(
    @Inject(CASH_REGISTER_REPOSITORY) private readonly cashRegisterRepository: ICashRegisterRepository,
  ) {}

  async execute(dto: OpenCashRegisterDto, userId?: string) {
    const today = getTodayDateString();
    const existing = await this.cashRegisterRepository.findByDate(today);
    if (existing) {
      if (existing.status === CashRegisterStatus.CLOSED) {
        throw new BadRequestException('La caja del dia ya fue cerrada. No se pueden registrar mas operaciones hoy.');
      }
      return existing;
    }

    return this.cashRegisterRepository.create({
      date: today,
      openingBalance: dto.openingBalance || 0,
      status: 'OPEN',
      entries: [],
      createdBy: userId,
    });
  }
}
