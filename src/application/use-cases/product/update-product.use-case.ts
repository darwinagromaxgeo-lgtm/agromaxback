import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { IProductRepository, PRODUCT_REPOSITORY } from '../../../domain/repositories/product.repository';
import { UpdateProductDto } from '../../dtos/product/update-product.dto';

@Injectable()
export class UpdateProductUseCase {
  constructor(@Inject(PRODUCT_REPOSITORY) private readonly productRepository: IProductRepository) {}

  async execute(id: string, dto: UpdateProductDto) {
    const product = await this.productRepository.update(id, dto);
    if (!product) throw new NotFoundException('Producto no encontrado');
    return product;
  }
}
