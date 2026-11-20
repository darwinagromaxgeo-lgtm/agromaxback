import { ForbiddenException } from '@nestjs/common';
import { ProductEntity } from '../../domain/entities/product.entity';

export function configuredSalePrice(product: ProductEntity, tierId: string, companyId: string, branchId: string): number | undefined {
  const prices = product.prices || [];
  return (
    prices.find(p => p.priceTierId === tierId && p.branchId === branchId && p.companyId === companyId)
    || prices.find(p => p.priceTierId === tierId && p.branchId === branchId && !p.companyId)
    || prices.find(p => p.priceTierId === tierId && !p.branchId && p.companyId === companyId)
    || prices.find(p => p.priceTierId === tierId && !p.branchId && !p.companyId)
  )?.price;
}

export function assertConfiguredSalePrice(product: ProductEntity, item: { priceTier: string; companyId: string; unitPrice: number }, branchId: string): void {
  const configured = configuredSalePrice(product, item.priceTier, item.companyId, branchId);
  if (configured === undefined || !Number.isFinite(configured) || item.unitPrice !== configured) {
    throw new ForbiddenException(`Solo un administrador puede cambiar el precio de "${product.name}". Usa el precio configurado para la sucursal, empresa y rango seleccionados`);
  }
}
