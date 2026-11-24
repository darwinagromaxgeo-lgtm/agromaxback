import { BadRequestException, ConflictException } from '@nestjs/common';
import { ClientSession, Connection, Types } from 'mongoose';

type Database = NonNullable<Connection['db']>;
const objectId = (value: any) => new Types.ObjectId(String(value));
const round = (value: number) => Math.round(value * 1e6) / 1e6;

export async function assertCancellationCreditSafe(db: Database, saleId: any, branch: any, session?: ClientSession) {
  const credits = await db.collection<any>('credit_accounts').find({ branch: objectId(branch), sales: objectId(saleId) }, { session }).toArray();
  for (const credit of credits) {
    const others = await db.collection('sales').countDocuments({ _id: { $in: credit.sales.filter((id: any) => String(id) !== String(saleId)) }, branch: objectId(branch), isCancelled: { $ne: true } }, { session });
    if (others && (credit.paidAmount > 0 || credit.payments?.length)) {
      throw new BadRequestException('La venta comparte un crédito con otras ventas y abonos. Revisa la distribución de esos abonos antes de anularla');
    }
  }
  return credits;
}

/** The fiscal result and this reversal share one transaction. Never call without a session. */
export async function cancelSaleInTransaction(db: Database, session: ClientSession, saleId: any, branchId: any, reason: string, userId?: any) {
  const branch = objectId(branchId), id = objectId(saleId);
  const sales = db.collection<any>('sales');
  const sale = await sales.findOne({ _id: id, branch }, { session });
  if (!sale) throw new BadRequestException('Venta no encontrada en la sucursal activa');
  if (sale.isCancelled) return;
  if (!reason.trim()) throw new BadRequestException('Indica el motivo de la anulación');
  const submitted = await db.collection('billing_documents').findOne({ sale: id, branch, status: { $in: ['SENDING', 'PENDING', 'ACCEPTED', 'UNKNOWN'] }, $nor: [{ status: 'ACCEPTED', activeSlot: false, cancelledByCreditNote: { $type: 'objectId' } }] }, { session });
  if (submitted) throw new BadRequestException('La venta tiene un comprobante enviado, aceptado o pendiente de revisión. Debe resolverse su situación fiscal antes de anularla');
  const credits = await assertCancellationCreditSafe(db, id, branch, session);
  const now = new Date(), actor = userId ? objectId(userId) : undefined;
  // This write serializes concurrent cancellations; a transaction retry sees isCancelled.
  const claimed = await sales.updateOne({ _id: id, branch, isCancelled: { $ne: true } }, { $set: { isCancelled: true, cancelledAt: now, cancelReason: reason.trim(), ...(actor ? { cancelledBy: actor } : {}), updatedAt: now }, $inc: { __v: 1 } }, { session });
  if (claimed.modifiedCount !== 1) throw new ConflictException('La venta cambió durante la anulación');

  for (let index = 0; index < sale.items.length; index++) {
    const item = sale.items[index];
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) throw new ConflictException('Revisa la cantidad del producto antes de devolver stock');
    let product = await db.collection<any>('products').findOne({ _id: item.product }, { session });
    const consolidation = product?.catalogImport?.deduplication;
    if (consolidation?.inventoryConsolidated && (!Types.ObjectId.isValid(consolidation.canonicalProductId) || String(consolidation.canonicalProductId) === String(item.product))) throw new ConflictException('Revisa la ficha principal del producto consolidado antes de devolver stock');
    const productId = consolidation?.inventoryConsolidated ? objectId(consolidation.canonicalProductId) : objectId(item.product);
    if (consolidation?.inventoryConsolidated) product = await db.collection<any>('products').findOne({ _id: productId }, { session });
    if (!product || product.catalogImport?.deduplication?.inventoryConsolidated) throw new ConflictException('La ficha principal del producto no está disponible para devolver stock');
    const scope = { product: productId, company: objectId(item.company), branch };
    const stock = await db.collection<any>('stocks').findOne(scope, { session });
    const previousStock = stock?.quantity || 0, newStock = round(previousStock + item.quantity);
    await db.collection('stocks').updateOne(scope, { $set: { quantity: newStock, lastUpdated: now, updatedAt: now }, $setOnInsert: { ...scope, createdAt: now, __v: 0 } }, { session, upsert: true });
    if (product.tracksLot) {
      if (item.lotAllocations?.length && !consolidation?.inventoryConsolidated) {
        if (item.lotAllocations.some((allocation: any) => !Number.isFinite(allocation.quantity) || allocation.quantity <= 0)) throw new ConflictException('Revisa las cantidades de los lotes originales antes de devolver stock');
        if (round(item.lotAllocations.reduce((sum: number, lot: any) => sum + lot.quantity, 0)) !== round(item.quantity)) throw new ConflictException('Los lotes de la venta no coinciden con la cantidad a devolver');
        for (const allocation of item.lotAllocations) {
          const restored = await db.collection('product_lots').updateOne({ _id: objectId(allocation.lotId), ...scope }, { $inc: { currentQuantity: allocation.quantity }, $set: { isActive: true, updatedAt: now } }, { session });
          if (restored.matchedCount !== 1) throw new ConflictException('No se encontró el lote original para devolver el producto');
        }
      } else {
        // Old sales did not store lot allocations. Keep their returned stock traceable,
        // without assigning another sale's lot or inventing an expiration date.
        await db.collection('product_lots').insertOne({ ...scope, lotNumber: `DEV-${id}-${index + 1}`, initialQuantity: item.quantity, currentQuantity: item.quantity, receivedAt: now, isActive: true, createdAt: now, updatedAt: now, __v: 0 }, { session });
      }
    }
    await db.collection('stock_movements').insertOne({ ...scope, movementType: 'ADJUSTMENT_IN', quantity: item.quantity, previousStock, newStock, referenceId: id, referenceType: 'SaleCancellation', description: `Anulación de venta: ${product.name} x${item.quantity}`, ...(actor ? { user: actor } : {}), date: now, createdAt: now, updatedAt: now }, { session });
  }

  const cashReferences: any[] = [{ referenceId: id, referenceType: 'Sale' }];
  for (const credit of credits) {
    const otherSales = await sales.countDocuments({ _id: { $in: credit.sales }, branch, isCancelled: { $ne: true } }, { session });
    if (otherSales) {
      const totalAmount = Math.max(0, Math.round((credit.totalAmount - sale.total) * 100) / 100);
      await db.collection('credit_accounts').updateOne({ _id: credit._id, branch }, { $set: { totalAmount, pendingAmount: totalAmount, paidAmount: 0, status: totalAmount ? 'PENDING' : 'PAID', updatedAt: now }, $inc: { __v: 1 } }, { session });
    } else {
      await db.collection('credit_accounts').updateOne({ _id: credit._id, branch }, { $set: { status: 'CANCELLED', pendingAmount: 0, cancelledAt: now, cancelReason: reason.trim(), ...(actor ? { cancelledBy: actor } : {}), updatedAt: now }, $inc: { __v: 1 } }, { session });
      cashReferences.push({ referenceId: credit._id, referenceType: 'CreditAccount' });
      const entryIds = (credit.payments || []).filter((payment: any) => payment.cashRegisterEntryId).map((payment: any) => objectId(payment.cashRegisterEntryId));
      if (entryIds.length) cashReferences.push({ _id: { $in: entryIds } });
    }
  }
  const entryFilter = { isDeleted: { $ne: true }, $or: cashReferences };
  await db.collection('cash_registers').updateMany({ branch, entries: { $elemMatch: entryFilter } }, { $set: { 'entries.$[entry].isDeleted': true, 'entries.$[entry].deletedAt': now, 'entries.$[entry].deleteReason': `Anulación de venta: ${reason.trim()}`, ...(actor ? { 'entries.$[entry].deletedBy': actor } : {}), updatedAt: now }, $inc: { __v: 1 } }, { session, arrayFilters: [{ 'entry.isDeleted': { $ne: true }, $or: cashReferences.map(reference => Object.fromEntries(Object.entries(reference).map(([key, value]) => [`entry.${key}`, value]))) }] });
  await db.collection('billing_documents').updateMany({ sale: id, branch, status: 'DRAFT' }, { $set: { status: 'DISCARDED', activeSlot: false, discardedAt: now, discardReason: `Venta anulada: ${reason.trim()}`, ...(actor ? { discardedBy: actor } : {}), updatedAt: now } }, { session });
  await db.collection('billing_documents').updateMany({ sale: id, branch, cancelledByCreditNote: { $exists: true } }, { $set: { saleCancelledAt: now } }, { session });
  await db.collection('billing_credit_notes').updateMany({ sale: id, branch, status: 'ACCEPTED', reasonCode: '01' }, { $set: { saleCancelledAt: now } }, { session });
}
