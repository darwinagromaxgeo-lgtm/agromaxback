import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { IProductRepository, PRODUCT_REPOSITORY } from '../../../domain/repositories/product.repository';
import { UpdateProductDto } from '../../dtos/product/update-product.dto';
import { productCatalogPendingFields } from '../../services/product-catalog-readiness';
import { ProductEntity } from '../../../domain/entities/product.entity';

@Injectable()
export class UpdateProductUseCase {
  constructor(@Inject(PRODUCT_REPOSITORY) private readonly productRepository: IProductRepository) {}

  async execute(id: string, dto: UpdateProductDto) {
    const existing = await this.productRepository.findById(id);
    if (!existing) throw new NotFoundException('Producto no encontrado');
    const change: Partial<ProductEntity> = { ...dto };
    if (existing.catalogImport || existing.catalogStatus === 'PENDING_REVIEW' || dto.taxType === 'PENDIENTE') {
      change.catalogStatus = productCatalogPendingFields({ ...existing, ...dto }).length ? 'PENDING_REVIEW' : 'READY';
    }
    const product = await this.productRepository.update(id, change);
    if (!product) throw new NotFoundException('Producto no encontrado');
    return product;
  }
}
