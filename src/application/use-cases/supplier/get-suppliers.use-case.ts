import { Injectable, Inject } from '@nestjs/common';
import { ISupplierRepository, SUPPLIER_REPOSITORY } from '../../../domain/repositories/supplier.repository';
import { PaginationDto } from '../../dtos/common/pagination.dto';

@Injectable()
export class GetSuppliersUseCase {
  constructor(@Inject(SUPPLIER_REPOSITORY) private readonly supplierRepository: ISupplierRepository) {}
  async execute(filter: PaginationDto) { return this.supplierRepository.findAll({ search: filter.search, isActive: true }, filter.page, filter.limit); }
}
