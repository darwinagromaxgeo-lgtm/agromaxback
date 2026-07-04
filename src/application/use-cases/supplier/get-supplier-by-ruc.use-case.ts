import { Injectable, Inject } from '@nestjs/common';
import { ISupplierRepository, SUPPLIER_REPOSITORY } from '../../../domain/repositories/supplier.repository';

@Injectable()
export class GetSupplierByRucUseCase {
  constructor(@Inject(SUPPLIER_REPOSITORY) private readonly supplierRepository: ISupplierRepository) {}
  async execute(ruc: string) { return this.supplierRepository.findByRuc(ruc); }
}
