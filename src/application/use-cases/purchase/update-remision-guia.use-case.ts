import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { IPurchaseRepository, PURCHASE_REPOSITORY } from '../../../domain/repositories/purchase.repository';
import { UpdateRemisionGuiaDto } from '../../dtos/purchase/update-remision-guia.dto';

@Injectable()
export class UpdateRemisionGuiaUseCase {
  constructor(
    @Inject(PURCHASE_REPOSITORY) private readonly purchaseRepository: IPurchaseRepository,
  ) {}

  async execute(id: string, dto: UpdateRemisionGuiaDto) {
    const purchase = await this.purchaseRepository.findById(id);
    if (!purchase) throw new NotFoundException('Compra no encontrada');
    return this.purchaseRepository.updateRemisionGuia(id, {
      serie: dto.serie,
      correlativo: dto.correlativo,
      fecha: new Date(dto.fecha),
    });
  }
}
