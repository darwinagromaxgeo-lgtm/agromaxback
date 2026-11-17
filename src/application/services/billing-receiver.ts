import { BadRequestException } from '@nestjs/common';
import { BillingDocumentType, BillingPartySnapshot } from '../../domain/entities/billing-document.entity';
import { moneyCents } from './billing-calculation';

export function normalizeBillingReceiver(type: BillingDocumentType, total: number, receiver: BillingPartySnapshot): BillingPartySnapshot {
  const number = receiver.documentNumber?.replace(/\s/g, '') || '';
  if (receiver.documentType === 'UNIDENTIFIED') {
    if (type !== 'BOLETA') throw new BadRequestException('La factura requiere RUC de 11 dígitos que comience con 10 o 20');
    if (number) throw new BadRequestException('La boleta simple no debe contener un DNI o RUC oculto');
    if (moneyCents(total) > 70_000) throw new BadRequestException('Para una boleta mayor a S/700 identifica al cliente con DNI o RUC');
    return { name: 'CONSUMIDOR FINAL', documentType: 'UNIDENTIFIED' };
  }
  if (receiver.documentType === 'RUC') {
    if (!/^(10|20)\d{9}$/.test(number)) throw new BadRequestException('Ingresa un RUC de 11 dígitos que comience con 10 o 20');
  } else if (receiver.documentType === 'DNI') {
    if (type === 'FACTURA') throw new BadRequestException('La factura requiere RUC; no se puede emitir con DNI');
    if (!/^\d{8}$/.test(number)) throw new BadRequestException('Ingresa un DNI de 8 dígitos');
  } else throw new BadRequestException('Tipo de documento del cliente no admitido');
  const name = receiver.name?.trim();
  if (!name) throw new BadRequestException('Completa el nombre o razón social del cliente');
  return { name, documentType: receiver.documentType, documentNumber: number, address: receiver.address?.trim() || undefined, email: receiver.email?.trim() || undefined };
}

export function sameBillingReceiver(a: BillingPartySnapshot, b: BillingPartySnapshot) {
  return (['name', 'documentType', 'documentNumber', 'address', 'email'] as const).every(key => (a[key] || '') === (b[key] || ''));
}
