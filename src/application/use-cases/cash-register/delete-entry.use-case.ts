import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { ICashRegisterRepository, CASH_REGISTER_REPOSITORY } from '../../../domain/repositories/cash-register.repository';
import { BILLING_DOCUMENT_REPOSITORY, IBillingDocumentRepository } from '../../../domain/repositories/billing-document.repository';
import { DeleteEntryDto } from '../../dtos/cash-register/delete-entry.dto';

@Injectable()
export class DeleteEntryUseCase {
  constructor(
    @Inject(CASH_REGISTER_REPOSITORY) private readonly cashRegisterRepository: ICashRegisterRepository,
    @Inject(BILLING_DOCUMENT_REPOSITORY) private readonly billingDocuments: IBillingDocumentRepository,
  ) {}

  async execute(registerId: string, entryId: string, dto: DeleteEntryDto, userId?: string) {
    const register = await this.cashRegisterRepository.findById(registerId);
    if (!register) throw new BadRequestException('Caja registradora no encontrada');
    if (register.status === 'CLOSED') throw new BadRequestException('La caja está cerrada');
    const entry = register.entries.find(e => e.id === entryId);
    if (!entry) throw new BadRequestException('Movimiento no encontrado');
    if (entry.isDeleted) throw new BadRequestException('El movimiento ya fue eliminado');
    if (entry.referenceType === 'Sale' && entry.referenceId && await this.billingDocuments.hasSubmittedSale(entry.referenceId)) {
      throw new BadRequestException('La venta vinculada tiene un comprobante fiscal enviado. Revisa su situación antes de anular el movimiento');
    }
    if (entry.referenceId && ['Sale', 'CreditAccount'].includes(entry.referenceType || '')) {
      throw new BadRequestException('Este cobro está vinculado a una venta o abono. Revisa la operación desde Ventas o Créditos para mantener sus saldos consistentes');
    }
    return this.cashRegisterRepository.updateOpenEntry(registerId, entryId, {
      isDeleted: true, deletedBy: userId, deletedAt: new Date(), deleteReason: dto.reason,
    });
  }
}
