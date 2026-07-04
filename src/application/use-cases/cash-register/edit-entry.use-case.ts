import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { ICashRegisterRepository, CASH_REGISTER_REPOSITORY } from '../../../domain/repositories/cash-register.repository';
import { EditEntryDto } from '../../dtos/cash-register/edit-entry.dto';

@Injectable()
export class EditEntryUseCase {
  constructor(
    @Inject(CASH_REGISTER_REPOSITORY) private readonly cashRegisterRepository: ICashRegisterRepository,
  ) {}

  async execute(registerId: string, entryId: string, dto: EditEntryDto, userId?: string) {
    const register = await this.cashRegisterRepository.findById(registerId);
    if (!register) throw new BadRequestException('Caja registradora no encontrada');
    if (register.status === 'CLOSED') throw new BadRequestException('La caja está cerrada');

    const entry = register.entries.find(e => e.id === entryId);
    if (!entry) throw new BadRequestException('Movimiento no encontrado');
    if (entry.isDeleted) throw new BadRequestException('El movimiento fue eliminado');

    const amountChanged = dto.amount !== entry.amount;
    const voucherChanged = dto.voucherType !== undefined && dto.voucherType !== entry.voucherType;
    const voucherSeriesChanged = dto.voucherSeries !== undefined && (dto.voucherSeries || '') !== (entry.voucherSeries || '');
    const voucherNumberChanged = dto.voucherNumber !== undefined && (dto.voucherNumber || '') !== (entry.voucherNumber || '');

    if (!amountChanged && !voucherChanged && !voucherSeriesChanged && !voucherNumberChanged) {
      throw new BadRequestException('No hay cambios para guardar.');
    }

    // Bloquear cambio de MONTO en entradas auto-generadas (ventas o pagos de crédito).
    // El monto de esas entradas es un reflejo de la venta/pago original; modificarlo acá
    // desincroniza la caja con la fuente y genera descuadres. El cambio de voucherType
    // (BOLETA / NONE) sí está permitido, ya que es un dato propio de la entrada.
    if (amountChanged && entry.referenceId && (entry.referenceType === 'Sale' || entry.referenceType === 'CreditAccount')) {
      const origen = entry.referenceType === 'Sale' ? 'una venta' : 'un pago de crédito';
      throw new BadRequestException(
        `No se puede modificar el monto de esta entrada porque proviene de ${origen}. Si necesitás corregir el monto, anulá la operación original y registrala nuevamente. (Cambiar el comprobante BOLETA/NONE sí está permitido.)`,
      );
    }

    const updateData: any = {};

    if (amountChanged) {
      updateData.amount = dto.amount;
      updateData.$push = {
        editHistory: {
          previousAmount: entry.amount,
          newAmount: dto.amount,
          reason: dto.reason,
          editedBy: userId,
          editedAt: new Date(),
        },
      };
    }

    if (voucherChanged) updateData.voucherType = dto.voucherType;
    if (voucherSeriesChanged) updateData.voucherSeries = dto.voucherSeries;
    if (voucherNumberChanged) updateData.voucherNumber = dto.voucherNumber;

    return this.cashRegisterRepository.updateEntry(registerId, entryId, updateData);
  }
}
