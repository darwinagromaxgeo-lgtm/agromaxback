import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { ICashRegisterRepository, CASH_REGISTER_REPOSITORY } from '../../../domain/repositories/cash-register.repository';
import { EditEntryDto } from '../../dtos/cash-register/edit-entry.dto';
import { IPaymentMethodRepository, PAYMENT_METHOD_REPOSITORY } from '../../../domain/repositories/payment-method.repository';
import { entryPaymentMethod, cashMethodKey } from '../../../shared/utils/cash-summary';

@Injectable()
export class EditEntryUseCase {
  constructor(
    @Inject(CASH_REGISTER_REPOSITORY) private readonly cashRegisterRepository: ICashRegisterRepository,
    @Inject(PAYMENT_METHOD_REPOSITORY) private readonly paymentMethods: IPaymentMethodRepository,
  ) {}

  async execute(registerId: string, entryId: string, dto: EditEntryDto, userId?: string) {
    const register = await this.cashRegisterRepository.findById(registerId);
    if (!register) throw new BadRequestException('Caja registradora no encontrada');
    if (register.status === 'CLOSED') throw new BadRequestException('La caja está cerrada');

    const entry = register.entries.find(e => e.id === entryId);
    if (!entry) throw new BadRequestException('Movimiento no encontrado');
    if (entry.isDeleted) throw new BadRequestException('El movimiento fue eliminado');
    if (dto.reason.trim().length < 5) throw new BadRequestException('Explica el motivo del cambio (mínimo 5 caracteres)');
    const method = dto.paymentMethodId ? await this.paymentMethods.findById(dto.paymentMethodId) : null;
    if (dto.paymentMethodId && (!method || !method.isActive)) throw new BadRequestException('Método de pago no encontrado o inactivo');
    const previousMethod = entryPaymentMethod(entry);
    const methodChanged = !!method && (entry.paymentMethodId !== method.id || previousMethod !== method.name);
    const linked = !!entry.referenceId && ['Sale', 'CreditAccount'].includes(entry.referenceType || '');
    if (linked && methodChanged && previousMethod && cashMethodKey(previousMethod) !== cashMethodKey(method!.name)) {
      throw new BadRequestException('El método de pago pertenece a la venta o abono original. Corrígelo desde su operación de origen');
    }

    const amountChanged = dto.amount !== entry.amount;
    const voucherChanged = dto.voucherType !== undefined && dto.voucherType !== entry.voucherType;
    const voucherSeriesChanged = dto.voucherSeries !== undefined && (dto.voucherSeries || '') !== (entry.voucherSeries || '');
    const voucherNumberChanged = dto.voucherNumber !== undefined && (dto.voucherNumber || '') !== (entry.voucherNumber || '');

    if (!amountChanged && !voucherChanged && !voucherSeriesChanged && !voucherNumberChanged && !methodChanged) {
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

    const updateData: any = {
      $push: {
        editHistory: {
          previousAmount: entry.amount,
          newAmount: dto.amount,
          reason: dto.reason.trim(),
          editedBy: userId,
          editedAt: new Date(),
          previousPaymentMethodName: previousMethod || undefined,
          newPaymentMethodName: method?.name || previousMethod || undefined,
        },
      },
    };
    if (amountChanged) updateData.amount = dto.amount;
    if (methodChanged) { updateData.paymentMethodId = method!.id; updateData.paymentMethodName = method!.name; }

    if (voucherChanged) updateData.voucherType = dto.voucherType;
    if (voucherSeriesChanged) updateData.voucherSeries = dto.voucherSeries;
    if (voucherNumberChanged) updateData.voucherNumber = dto.voucherNumber;

    return this.cashRegisterRepository.updateOpenEntry(registerId, entryId, updateData);
  }
}
