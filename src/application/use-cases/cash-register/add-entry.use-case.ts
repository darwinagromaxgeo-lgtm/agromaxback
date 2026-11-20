import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { ICashRegisterRepository, CASH_REGISTER_REPOSITORY } from '../../../domain/repositories/cash-register.repository';
import { AddEntryDto } from '../../dtos/cash-register/add-entry.dto';
import { IPaymentMethodRepository, PAYMENT_METHOD_REPOSITORY } from '../../../domain/repositories/payment-method.repository';

@Injectable()
export class AddEntryUseCase {
  constructor(
    @Inject(CASH_REGISTER_REPOSITORY) private readonly cashRegisterRepository: ICashRegisterRepository,
    @Inject(PAYMENT_METHOD_REPOSITORY) private readonly paymentMethods: IPaymentMethodRepository,
  ) {}

  async execute(registerId: string, dto: AddEntryDto, userId?: string) {
    const register = await this.cashRegisterRepository.findById(registerId);
    if (!register) throw new BadRequestException('Caja registradora no encontrada');
    if (register.status === 'CLOSED') throw new BadRequestException('La caja está cerrada');

    if (!dto.description.trim()) throw new BadRequestException('Ingresa una descripción');
    const method = dto.paymentMethodId ? await this.paymentMethods.findById(dto.paymentMethodId) : null;
    if (!method || !method.isActive) throw new BadRequestException('Selecciona un método de pago activo');
    if (['OPERATING_EXPENSE', 'WITHDRAWAL'].includes(dto.category) && dto.type !== 'EXPENSE') throw new BadRequestException('Los gastos y retiros deben ser egresos');
    if (dto.category === 'CAPITAL_CONTRIBUTION' && dto.type !== 'INCOME') throw new BadRequestException('El aporte debe ser un ingreso');

    return this.cashRegisterRepository.addEntry(registerId, {
      type: dto.type,
      category: dto.category,
      description: dto.description.trim(),
      amount: dto.amount,
      paymentMethodId: method.id,
      paymentMethodName: method.name,
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
