import { Injectable, Inject, ConflictException, NotFoundException } from '@nestjs/common';
import { IPaymentMethodRepository, PAYMENT_METHOD_REPOSITORY } from '../../../domain/repositories/payment-method.repository';
import { CreatePaymentMethodDto, UpdatePaymentMethodDto } from '../../dtos/payment-method/create-payment-method.dto';

const DEFAULT_METHODS = ['Efectivo', 'Yape', 'Plin', 'Transferencia'];

@Injectable()
export class ManagePaymentMethodsUseCase {
  constructor(
    @Inject(PAYMENT_METHOD_REPOSITORY) private readonly paymentMethodRepository: IPaymentMethodRepository,
  ) {}

  async create(dto: CreatePaymentMethodDto) {
    const existing = await this.paymentMethodRepository.findByName(dto.name);
    if (existing) throw new ConflictException('El nombre del método de pago ya existe');
    return this.paymentMethodRepository.create({ name: dto.name, isActive: true });
  }

  async findAll() {
    const methods = await this.paymentMethodRepository.findAll();
    if (methods.length === 0) {
      for (const name of DEFAULT_METHODS) {
        await this.paymentMethodRepository.create({ name, isActive: true });
      }
      return this.paymentMethodRepository.findAll();
    }
    return methods;
  }

  async update(id: string, dto: UpdatePaymentMethodDto) {
    const method = await this.paymentMethodRepository.update(id, dto);
    if (!method) throw new NotFoundException('Método de pago no encontrado');
    return method;
  }
}
