import { BadRequestException, ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { Model, Types } from 'mongoose';
import { BranchTransferCommand, BranchTransferEntity } from '../../../../domain/entities/branch-transfer.entity';
import { IBranchTransferRepository } from '../../../../domain/repositories/branch-transfer.repository';
import { BRANCH_TRANSFER_MODEL } from '../schemas/branch-transfer.schema';

const quantity = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

@Injectable()
export class MongoBranchTransferRepository implements IBranchTransferRepository, OnModuleInit {
  constructor(@InjectModel(BRANCH_TRANSFER_MODEL) private readonly model: Model<any>) {}
  async onModuleInit() { await this.model.init(); }

  async transfer(command: BranchTransferCommand, userId: string): Promise<BranchTransferEntity> {
    const db = this.model.db.db!;
    const transfers = db.collection('branch_stock_transfers');
    const requestHash = createHash('sha256').update(JSON.stringify({
      from: command.fromBranchId, to: command.toBranchId, company: command.companyId,
      items: command.items.map(item => ({ productId: item.productId, quantity: item.quantity })).sort((a, b) => a.productId.localeCompare(b.productId)), notes: command.notes || '',
    })).digest('hex');
    const replay = (record: any) => {
      if (record.requestHash !== requestHash || record.transferredBy.toString() !== userId) throw new ConflictException('El identificador de envío ya corresponde a otra transferencia');
      return this.toEntity(record);
    };
    const session = await this.model.db.startSession();
    const id = new Types.ObjectId(), now = new Date();
    const from = new Types.ObjectId(command.fromBranchId), to = new Types.ObjectId(command.toBranchId), company = new Types.ObjectId(command.companyId), actor = new Types.ObjectId(userId);
    try {
      const result = await session.withTransaction(async () => {
        const existing = await transfers.findOne({ requestId: command.requestId }, { session });
        if (existing) return replay(existing);
        // Native collections use explicit branch IDs for both sides; ordinary branch middleware must not rewrite them.
        const branches = await db.collection('branches').find({ _id: { $in: [from, to] }, isActive: true }, { session }).toArray();
        const source = branches.find(row => row._id.equals(from)), destination = branches.find(row => row._id.equals(to));
        if (!source || !destination || from.equals(to)) throw new BadRequestException('Elige dos sucursales activas y diferentes');
        if (![source, destination].every(row => (row.companies || []).some((value: any) => value.toString() === command.companyId))) throw new BadRequestException('La empresa debe estar habilitada en ambas sucursales');
        const issuer = await db.collection('companies').findOne({ _id: company, isActive: true }, { session });
        const user = await db.collection('users').findOne({ _id: actor, isActive: true, role: 'ADMIN' }, { session });
        if (!issuer || !user) throw new BadRequestException('Empresa o administrador no disponible');
        const items: BranchTransferEntity['items'] = [];
        for (const item of command.items) {
          const productId = new Types.ObjectId(item.productId);
          const product = await db.collection('products').findOne({ _id: productId, isActive: true }, { session });
          if (!product || product.catalogImport?.deduplication?.inventoryConsolidated) throw new BadRequestException('Un producto está inactivo o fue consolidado en otra ficha');
          const sourceFilter = { product: productId, company, branch: from };
          const sourceStock = await db.collection('stocks').findOneAndUpdate({ ...sourceFilter, $expr: { $gte: [{ $round: ['$quantity', 6] }, item.quantity] } }, [
            { $set: { quantity: { $round: [{ $subtract: ['$quantity', item.quantity] }, 6] }, lastUpdated: now, updatedAt: now } },
          ], { session, returnDocument: 'after' });
          if (!sourceStock) throw new ConflictException(`${product.name}: stock insuficiente o actualizado por otra operación. Revisa la disponibilidad`);
          const lots: BranchTransferEntity['items'][number]['lots'] = [];
          if (product.tracksLot) {
            const available = await db.collection('product_lots').find({ ...sourceFilter, isActive: true, currentQuantity: { $gt: 0 } }, { session }).toArray();
            available.sort((a, b) => (a.expirationDate ? new Date(a.expirationDate).getTime() : Infinity) - (b.expirationDate ? new Date(b.expirationDate).getTime() : Infinity) || new Date(a.receivedAt || 0).getTime() - new Date(b.receivedAt || 0).getTime() || a._id.toString().localeCompare(b._id.toString()));
            let remaining = Math.round(item.quantity * 1_000_000);
            for (const lot of available) {
              if (remaining <= 0) break;
              const takeUnits = Math.min(remaining, Math.round(lot.currentQuantity * 1_000_000));
              if (takeUnits <= 0) continue;
              const take = takeUnits / 1_000_000;
              const consumed = await db.collection('product_lots').updateOne({ _id: lot._id, branch: from, company, product: productId, isActive: true, $expr: { $gte: [{ $round: ['$currentQuantity', 6] }, take] } }, [
                { $set: { currentQuantity: { $round: [{ $subtract: ['$currentQuantity', take] }, 6] }, updatedAt: now } },
              ], { session });
              if (!consumed.matchedCount) throw new ConflictException(`${product.name}: cambió el saldo del lote ${lot.lotNumber}`);
              const targetFilter = { product: productId, company, branch: to, lotNumber: lot.lotNumber };
              const targetLot = await db.collection('product_lots').findOne(targetFilter, { session });
              const expiry = (date: any) => date ? new Date(date).getTime() : null;
              if (targetLot && (targetLot.isActive === false || expiry(targetLot.expirationDate) !== expiry(lot.expirationDate))) throw new BadRequestException(`${product.name}: revisa el estado o vencimiento del lote ${lot.lotNumber} en destino`);
              await db.collection('product_lots').updateOne(targetFilter, [
                { $set: { ...targetFilter, lotNumber: { $literal: lot.lotNumber }, initialQuantity: { $round: [{ $add: [{ $ifNull: ['$initialQuantity', 0] }, take] }, 6] }, currentQuantity: { $round: [{ $add: [{ $ifNull: ['$currentQuantity', 0] }, take] }, 6] }, expirationDate: lot.expirationDate || null, receivedAt: { $ifNull: ['$receivedAt', now] }, isActive: true, createdAt: { $ifNull: ['$createdAt', now] }, updatedAt: now } },
              ], { session, upsert: true });
              lots.push({ lotNumber: lot.lotNumber, quantity: take, ...(lot.expirationDate ? { expirationDate: lot.expirationDate } : {}) });
              remaining -= takeUnits;
            }
            if (remaining > 0) throw new BadRequestException(`${product.name}: los lotes no cubren la cantidad a transferir`);
          }
          const destinationStock = await db.collection('stocks').findOneAndUpdate({ product: productId, company, branch: to }, [
            { $set: { product: productId, company, branch: to, quantity: { $round: [{ $add: [{ $ifNull: ['$quantity', 0] }, item.quantity] }, 6] }, lastUpdated: now, createdAt: { $ifNull: ['$createdAt', now] }, updatedAt: now } },
          ], { session, upsert: true, returnDocument: 'after' });
          if (!destinationStock) throw new ConflictException('No se pudo actualizar el stock de destino');
          const sourcePrevious = quantity(sourceStock.quantity + item.quantity), destinationPrevious = quantity(destinationStock.quantity - item.quantity);
          const common = { product: productId, company, quantity: item.quantity, referenceId: id, referenceType: 'BranchTransfer', user: actor, date: now, createdAt: now, updatedAt: now };
          await db.collection('stock_movements').insertMany([
            { ...common, branch: from, movementType: 'TRANSFER_OUT', previousStock: sourcePrevious, newStock: sourceStock.quantity, description: `Transferencia directa a ${destination.name}` },
            { ...common, branch: to, movementType: 'TRANSFER_IN', previousStock: destinationPrevious, newStock: destinationStock.quantity, description: `Transferencia directa desde ${source.name}` },
          ], { session });
          items.push({ productId: item.productId, productName: product.name, unit: product.unit, quantity: item.quantity, sourcePrevious, sourceCurrent: sourceStock.quantity, destinationPrevious, destinationCurrent: destinationStock.quantity, lots });
        }
        const record = { _id: id, requestId: command.requestId, requestHash, fromBranch: from, fromBranchName: source.name, toBranch: to, toBranchName: destination.name, company, companyName: issuer.name, status: 'COMPLETED', items, notes: command.notes, transferredBy: actor, transferredByName: user.fullName || user.username, createdAt: now, updatedAt: now };
        await transfers.insertOne(record, { session });
        return this.toEntity(record);
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      if (!result) throw new ConflictException('No se pudo confirmar la transferencia');
      return result;
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        const existing = await transfers.findOne({ requestId: command.requestId });
        if (existing) return replay(existing);
        throw new ConflictException('El inventario cambió durante el traslado. Revisa y reintenta la misma transferencia');
      }
      throw error;
    } finally { await session.endSession(); }
  }

  async findAll(branchId: string | undefined, page: number, limit: number) {
    const query = branchId ? { $or: [{ fromBranch: new Types.ObjectId(branchId) }, { toBranch: new Types.ObjectId(branchId) }] } : {};
    const collection = this.model.db.db!.collection('branch_stock_transfers');
    const [records, total] = await Promise.all([collection.find(query).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).toArray(), collection.countDocuments(query)]);
    return { data: records.map(record => this.toEntity(record)), total };
  }
  async findByRequest(requestId: string, userId: string) {
    const record = await this.model.db.db!.collection('branch_stock_transfers').findOne({ requestId });
    if (!record) return null;
    if (record.transferredBy.toString() !== userId) throw new ConflictException('El envío pertenece a otro administrador');
    return this.toEntity(record);
  }
  private toEntity(record: any): BranchTransferEntity {
    return { id: record._id.toString(), reference: `TS-${record._id.toString().slice(-8).toUpperCase()}`, fromBranchId: record.fromBranch.toString(), fromBranchName: record.fromBranchName, toBranchId: record.toBranch.toString(), toBranchName: record.toBranchName, companyId: record.company.toString(), companyName: record.companyName, status: 'COMPLETED', items: record.items, notes: record.notes, transferredBy: record.transferredBy.toString(), transferredByName: record.transferredByName, createdAt: record.createdAt };
  }
}
