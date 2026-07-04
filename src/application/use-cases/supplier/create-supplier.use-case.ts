import { Injectable, Inject } from '@nestjs/common';
import { ISupplierRepository, SUPPLIER_REPOSITORY } from '../../../domain/repositories/supplier.repository';
import { CreateSupplierDto } from '../../dtos/supplier/create-supplier.dto';

@Injectable()
export class CreateSupplierUseCase {
  constructor(@Inject(SUPPLIER_REPOSITORY) private readonly supplierRepository: ISupplierRepository) {}

  async execute(dto: CreateSupplierDto) {
    const existing = await this.supplierRepository.findByRuc(dto.ruc);
    if (existing) return existing;
    return this.supplierRepository.create({ ...dto, isActive: true });
  }
}
