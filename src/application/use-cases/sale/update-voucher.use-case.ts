import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { ISaleRepository, SALE_REPOSITORY } from '../../../domain/repositories/sale.repository';

@Injectable()
export class UpdateVoucherUseCase {
  constructor(
    @Inject(SALE_REPOSITORY) private readonly saleRepository: ISaleRepository,
  ) {}

  async execute(saleId: string, voucherType: string) {
    const sale = await this.saleRepository.findById(saleId);
    if (!sale) {
      throw new NotFoundException('Venta no encontrada');
    }
    if (sale.isCancelled) {
      throw new BadRequestException('No se puede modificar una venta anulada');
    }
    return this.saleRepository.update(saleId, { voucherType });
  }
}
