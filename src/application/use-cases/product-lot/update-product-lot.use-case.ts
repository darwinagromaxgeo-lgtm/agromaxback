import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { IProductLotRepository, PRODUCT_LOT_REPOSITORY } from '../../../domain/repositories/product-lot.repository';

@Injectable()
export class UpdateProductLotUseCase {
  constructor(
    @Inject(PRODUCT_LOT_REPOSITORY) private readonly lotRepo: IProductLotRepository,
  ) {}

  async execute(id: string, data: { lotNumber?: string; expirationDate?: string | null; isActive?: boolean }) {
    const existing = await this.lotRepo.findById(id);
    if (!existing) throw new NotFoundException('Lote no encontrado');

    const updateData: { lotNumber?: string; expirationDate?: Date | null; isActive?: boolean } = {};
    if (data.lotNumber !== undefined) updateData.lotNumber = data.lotNumber.trim();
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if ('expirationDate' in data) {
      updateData.expirationDate = data.expirationDate
        ? new Date(data.expirationDate + 'T12:00:00.000Z')
        : null;
    }

    return this.lotRepo.update(id, updateData);
  }
}
