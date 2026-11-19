import { BadRequestException } from '@nestjs/common';
import { BillingDocumentEntity } from '../../domain/entities/billing-document.entity';
import { BillingCreditNoteEntity, CreditNoteRequest } from '../../domain/entities/billing-credit-note.entity';
import { moneyCents } from './billing-calculation';

const reservedStates = new Set(['DRAFT', 'SENDING', 'PENDING', 'ACCEPTED', 'UNKNOWN']);
function quantityUnits(quantity: number) {
  const units = Math.round(quantity * 1_000_000);
  if (!Number.isFinite(quantity) || quantity < 0 || !Number.isSafeInteger(units) || Math.abs(units / 1_000_000 - quantity) > 1e-10) throw new BadRequestException('Las cantidades deben tener como máximo seis decimales');
  return units;
}

export function creditNoteAvailability(original: BillingDocumentEntity, notes: BillingCreditNoteEntity[]) {
  if (original.status !== 'ACCEPTED' || !original.hasCdr || !original.series || !Number.isSafeInteger(original.number) || original.number! < 1 || !original.environment || !original.submittedAt || !Number.isFinite(new Date(original.submittedAt).getTime())) throw new BadRequestException('La nota de crédito requiere un comprobante aceptado con CDR, fecha y numeración');
  if (original.items.reduce((sum, item) => sum + moneyCents(item.total), 0) !== moneyCents(original.total)) throw new BadRequestException('El detalle del comprobante original no concilia con su total');
  const reserved = notes.filter(note => reservedStates.has(note.status));
  return original.items.map((item, itemIndex) => {
    const units = quantityUnits(item.quantity);
    if (!units || moneyCents(item.baseAmount) + moneyCents(item.taxAmount) !== moneyCents(item.total)) throw new BadRequestException('El comprobante original contiene un detalle inválido');
    const credited = reserved.flatMap(note => note.items).filter(line => line.originalItemIndex === itemIndex);
    const usedUnits = credited.reduce((sum, line) => sum + quantityUnits(line.quantity), 0);
    const usedBase = credited.reduce((sum, line) => sum + moneyCents(line.baseAmount), 0);
    const usedTax = credited.reduce((sum, line) => sum + moneyCents(line.taxAmount), 0);
    if (usedUnits > units || usedBase > moneyCents(item.baseAmount) || usedTax > moneyCents(item.taxAmount)) throw new BadRequestException('Las notas previas superan el comprobante original; requiere revisión');
    return { itemIndex, ...item, creditedQuantity: usedUnits / 1_000_000, availableQuantity: (units - usedUnits) / 1_000_000, availableAmount: (moneyCents(item.total) - usedBase - usedTax) / 100, usedBase, usedTax };
  });
}

export function buildCreditNote(original: BillingDocumentEntity, notes: BillingCreditNoteEntity[], request: CreditNoteRequest): BillingCreditNoteEntity {
  const available = creditNoteAvailability(original, notes);
  if (!['TOTAL', 'PARTIAL'].includes(request.returnType) || !request.reason?.trim() || request.reason.trim().length > 500) throw new BadRequestException('Indica el tipo de devolución y su motivo (hasta 500 caracteres)');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(request.reason)) throw new BadRequestException('El motivo contiene caracteres no válidos');
  if (request.returnType === 'TOTAL' && request.items?.length) throw new BadRequestException('La devolución total utiliza todo el saldo disponible; no envíes un detalle parcial');
  const selection = request.returnType === 'TOTAL' ? available.filter(line => line.availableQuantity > 0).map(line => ({ itemIndex:line.itemIndex, quantity:line.availableQuantity })) : request.items || [];
  if (!selection.length || selection.length > 200 || new Set(selection.map(line => line.itemIndex)).size !== selection.length) throw new BadRequestException('Selecciona al menos un producto, sin repetir renglones');
  const items = selection.map(selected => {
    const source = available[selected.itemIndex];
    if (!Number.isInteger(selected.itemIndex) || !source) throw new BadRequestException('El producto no pertenece al comprobante original');
    const returned = quantityUnits(selected.quantity), used = quantityUnits(source.creditedQuantity), totalUnits = quantityUnits(source.quantity);
    if (returned <= 0 || returned > quantityUnits(source.availableQuantity)) throw new BadRequestException(`Cantidad superior al saldo disponible de ${source.description}`);
    // Allocate cumulative cents: the last partial return receives the remaining cent(s).
    const proportion = (cents: number) => Number((BigInt(cents) * BigInt(used + returned) + BigInt(Math.floor(totalUnits / 2))) / BigInt(totalUnits));
    const base = proportion(moneyCents(source.baseAmount)) - source.usedBase;
    const tax = proportion(moneyCents(source.taxAmount)) - source.usedTax;
    if (base < 0 || tax < 0 || base + tax <= 0) throw new BadRequestException('La cantidad seleccionada no produce un importe válido; revisa las cantidades');
    const originalItem = original.items[selected.itemIndex];
    return { ...originalItem, originalItemIndex:selected.itemIndex, quantity:selected.quantity, baseAmount:base / 100, taxAmount:tax / 100, total:(base + tax) / 100 };
  });
  const sum = (field: 'baseAmount' | 'taxAmount' | 'total', type?: string) => items.filter(item => !type || item.taxType === type).reduce((value, item) => value + moneyCents(item[field]), 0) / 100;
  const complete = items.length === original.items.length && items.every(item => quantityUnits(item.quantity) === quantityUnits(original.items[item.originalItemIndex].quantity));
  return {
    branchId:original.branchId, companyId:original.companyId, saleId:original.saleId,
    documentType:'NOTA_CREDITO', originalDocumentId:original.id!, originalDocumentType:original.documentType,
    originalSeries:original.series!, originalNumber:original.number!, originalIssuedAt:original.submittedAt!,
    reasonCode:complete ? '06' : '07', reasonDescription:request.reason.trim(),
    taxType:original.taxType, currency:original.currency, issuer:{ ...original.issuer }, receiver:{ ...original.receiver },
    status:'DRAFT', items, taxableAmount:sum('baseAmount','GRAVADO'), exemptAmount:sum('baseAmount','EXONERADO'), unaffectedAmount:sum('baseAmount','INAFECTO'), taxAmount:sum('taxAmount'), total:sum('total'),
    paymentCondition:original.paymentCondition, saleDate:original.saleDate, environment:original.environment,
    warnings:[], legacyTaxData:false,
  };
}
