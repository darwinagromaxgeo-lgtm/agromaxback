import { BadRequestException } from '@nestjs/common';
import { BillingItemSnapshot, BillingTaxType } from '../../domain/entities/billing-document.entity';

export function moneyCents(value: number): number {
  if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(Math.round(value * 100))) {
    throw new BadRequestException('La venta contiene un importe inválido');
  }
  return Math.round((value + Number.EPSILON) * 100);
}

export function calculateBillingItem(input: {
  productId: string; description: string; unit: string; quantity: number;
  unitPrice: number; subtotal: number; taxType: string; taxRate?: number;
}): BillingItemSnapshot {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new BadRequestException('La cantidad del producto debe ser mayor que cero');
  if (!['GRAVADO', 'EXONERADO', 'INAFECTO'].includes(input.taxType)) {
    throw new BadRequestException(`Revisa la afectación tributaria de ${input.description}`);
  }
  const total = moneyCents(input.subtotal);
  if (Math.abs(moneyCents(input.quantity * input.unitPrice) - total) > 1) {
    throw new BadRequestException(`El subtotal no coincide con cantidad y precio de ${input.description}`);
  }
  const taxRate = input.taxType === 'GRAVADO' ? (input.taxRate ?? 0.18) : 0;
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 1 || (input.taxType === 'GRAVADO' && taxRate === 0)) throw new BadRequestException('La tasa de impuesto de la venta es inválida');
  const base = Math.round(total / (1 + taxRate));
  return {
    productId: input.productId,
    description: input.description,
    unit: input.unit,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    taxType: input.taxType as BillingTaxType,
    taxRate,
    baseAmount: base / 100,
    taxAmount: (total - base) / 100,
    total: total / 100,
  };
}

export function sunatUnit(unit: string): string {
  const normalized = unit.trim().toUpperCase();
  const units: Record<string, string> = {
    UND: 'NIU', UNIDAD: 'NIU', UNIDADES: 'NIU', UN: 'NIU', NIU: 'NIU',
    KG: 'KGM', KILO: 'KGM', KILOGRAMO: 'KGM', KGM: 'KGM',
    L: 'LTR', LT: 'LTR', LITRO: 'LTR', LITROS: 'LTR', LTR: 'LTR',
    G: 'GRM', GRAMO: 'GRM', GRM: 'GRM', ML: 'MLT', MLT: 'MLT',
    M: 'MTR', METRO: 'MTR', MTR: 'MTR', CAJA: 'BX', BX: 'BX',
    BOLSA: 'BG', BG: 'BG', SACO: 'SA', SA: 'SA', PAQUETE: 'PK', PK: 'PK',
    PAR: 'PR', PARES: 'PR', PR: 'PR',
  };
  if (!units[normalized]) throw new BadRequestException(`Configura una unidad compatible para el producto (${unit || 'sin unidad'})`);
  return units[normalized];
}
