import { Injectable, Inject } from '@nestjs/common';
import { IProductRepository, PRODUCT_REPOSITORY } from '../../../domain/repositories/product.repository';
import { FilterProductDto } from '../../dtos/product/filter-product.dto';

@Injectable()
export class GetProductsUseCase {
  constructor(@Inject(PRODUCT_REPOSITORY) private readonly productRepository: IProductRepository) {}

  async execute(filter: FilterProductDto) {
    return this.productRepository.findAll(
      { search: filter.search, category: filter.category, activeIngredient: filter.activeIngredient, control: filter.control, isActive: filter.isActive, sellableOnly: filter.sellableOnly, supplier: filter.supplier, unit: filter.unit, sort: filter.sort },
      filter.page, filter.limit,
    );
  }
}
