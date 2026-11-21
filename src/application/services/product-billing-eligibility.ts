import { BadRequestException } from '@nestjs/common';
import { ProductEntity } from '../../domain/entities/product.entity';

export function assertProductAllowsBilling(product: Pick<ProductEntity, 'name' | 'billingEnabled'> | null | undefined): void {
  if (product?.billingEnabled === false) throw new BadRequestException(`El producto "${product.name}" no está habilitado para boletas ni facturas. Se permite en notas de venta y cotizaciones`);
}
