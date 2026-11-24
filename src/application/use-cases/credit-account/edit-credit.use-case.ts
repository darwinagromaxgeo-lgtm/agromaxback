import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { ICreditAccountRepository, CREDIT_ACCOUNT_REPOSITORY } from '../../../domain/repositories/credit-account.repository';
import { EditCreditDto } from '../../dtos/credit-account/edit-credit.dto';

@Injectable()
export class EditCreditUseCase {
  constructor(
    @Inject(CREDIT_ACCOUNT_REPOSITORY) private readonly creditRepository: ICreditAccountRepository,
  ) {}

  async execute(id: string, dto: EditCreditDto) {
    const credit = await this.creditRepository.findById(id);
    if (!credit) throw new BadRequestException('Crédito no encontrado');
    if (credit.status === 'CANCELLED') throw new BadRequestException('El crédito anulado se conserva como historial y no se puede modificar');

    if (dto.totalAmount < credit.paidAmount) {
      throw new BadRequestException(`El nuevo monto total (${dto.totalAmount}) no puede ser menor al monto ya pagado (${credit.paidAmount})`);
    }

    const newPending = Math.round((dto.totalAmount - credit.paidAmount) * 100) / 100;
    const newStatus = newPending <= 0 ? 'PAID' : credit.paidAmount > 0 ? 'PARTIAL' : 'PENDING';

    return this.creditRepository.update(id, {
      totalAmount: dto.totalAmount,
      pendingAmount: newPending,
      status: newStatus,
    });
  }
}
