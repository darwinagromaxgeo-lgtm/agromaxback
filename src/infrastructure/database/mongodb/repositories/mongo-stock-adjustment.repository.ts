import { BadRequestException, ConflictException, ForbiddenException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash } from 'node:crypto';
import { IStockAdjustmentRepository } from '../../../../domain/repositories/stock-adjustment.repository';
import { StockAdjustmentEntity } from '../../../../domain/entities/stock-adjustment.entity';
import { StockAdjustmentBatch, StockAdjustmentBatchResult } from '../../../../domain/entities/stock-adjustment-batch.entity';
import { StockAdjustmentDocument, StockAdjustmentDoc } from '../schemas/stock-adjustment.schema';
import { StockAdjustmentBatchDocument } from '../schemas/stock-adjustment-batch.schema';
import { StockDocument } from '../schemas/stock.schema';
import { ProductLotDocument } from '../schemas/product-lot.schema';
import { ProductDocument } from '../schemas/product.schema';
import { StockMovementDocument } from '../schemas/stock-movement.schema';
import { CompanyDocument } from '../schemas/company.schema';
import { BranchDocument } from '../schemas/branch.schema';

const roundQuantity = (quantity: number) => Math.round((quantity + Number.EPSILON) * 1e6) / 1e6;

@Injectable()
export class MongoStockAdjustmentRepository implements IStockAdjustmentRepository, OnModuleInit {
  constructor(
    @InjectModel(StockAdjustmentDocument.name) private readonly model: Model<StockAdjustmentDoc>,
    @InjectModel(StockAdjustmentBatchDocument.name) private readonly batches: Model<StockAdjustmentBatchDocument>,
    @InjectModel(StockDocument.name) private readonly stocks: Model<StockDocument>,
    @InjectModel(ProductLotDocument.name) private readonly lots: Model<ProductLotDocument>,
    @InjectModel(ProductDocument.name) private readonly products: Model<ProductDocument>,
    @InjectModel(StockMovementDocument.name) private readonly movements: Model<StockMovementDocument>,
    @InjectModel(CompanyDocument.name) private readonly companies: Model<CompanyDocument>,
    @InjectModel(BranchDocument.name) private readonly branches: Model<BranchDocument>,
  ) {}

  async onModuleInit() {
    await this.batches.createIndexes();
  }

  async applyBatch(input: StockAdjustmentBatch, branchId: string, userId?: string): Promise<StockAdjustmentBatchResult> {
    if (!Types.ObjectId.isValid(branchId)) throw new BadRequestException('Selecciona una sucursal');
    const reason = input.reason.trim();
    if (!reason || !input.items.length || input.items.length > 100) throw new BadRequestException('Indica el motivo y entre 1 y 100 productos');
    const items = input.items.map(item => ({
      productId: item.productId.toLowerCase(), type: item.type, quantity: item.quantity,
      expectedQuantity: item.expectedQuantity, lotNumber: item.lotNumber?.trim() || undefined,
      expirationDate: item.expirationDate || undefined,
    })).sort((a, b) => a.productId.localeCompare(b.productId));
    if (new Set(items.map(item => item.productId)).size !== items.length) throw new BadRequestException('Cada producto debe aparecer una sola vez');
    const scope = { branch: new Types.ObjectId(branchId), company: new Types.ObjectId(input.companyId) };
    const key = { ...scope, requestId: input.requestId };
    const payloadHash = createHash('sha256').update(JSON.stringify({ reason, items })).digest('hex');
    const replay = (batch: StockAdjustmentBatchDocument) => {
      if (batch.payloadHash !== payloadHash) throw new ConflictException('Este ajuste ya se guardó con otros datos. Abre un ajuste nuevo.');
      return batch.result;
    };
    const session = await this.model.db.startSession();
    let result!: StockAdjustmentBatchResult;
    try {
      await session.withTransaction(async () => {
        const branch = await this.branches.findOne({ _id: scope.branch, isActive: true }).session(session).lean();
        if (!branch || !branch.companies.some(company => company.equals(scope.company))) throw new ForbiddenException('La empresa no pertenece a la sucursal seleccionada');
        if (!await this.companies.exists({ _id: scope.company, isActive: true }).session(session)) throw new BadRequestException('La empresa no está disponible');
        const previous = await this.batches.findOne(key).session(session).lean();
        if (previous) { result = replay(previous); return; }
        result = { requestId: input.requestId, adjustments: [], unchangedProductIds: [] };
        const date = new Date();
        // Sequential writes on a single session: stock, lots and their audit all commit together.
        for (const item of items) {
          if (!['INCREASE', 'DECREASE', 'SET'].includes(item.type) || !Number.isFinite(item.quantity) || item.quantity < 0 || item.quantity > 1e12 || (item.type !== 'SET' && item.quantity === 0)) {
            throw new BadRequestException('Indica una cantidad válida. Sumar y restar requieren una cantidad mayor a cero.');
          }
          const product = await this.products.findOne({ _id: item.productId, isActive: true }).session(session).lean();
          if (!product) throw new BadRequestException('El producto seleccionado no está disponible');
          const query = { ...scope, product: new Types.ObjectId(item.productId) };
          const stock = await this.stocks.findOne(query).session(session).lean();
          const activeLots = await this.lots.find({ ...query, isActive: true, currentQuantity: { $gt: 0 } }).session(session).lean();
          const previousQuantity = roundQuantity(product.tracksLot
            ? activeLots.reduce((sum, lot) => sum + lot.currentQuantity, 0)
            : stock?.quantity ?? 0);
          if (item.type === 'SET' && item.expectedQuantity === undefined) throw new BadRequestException(`Actualiza el stock de ${product.name} antes de establecer su cantidad`);
          if (item.expectedQuantity !== undefined && Math.abs(previousQuantity - item.expectedQuantity) > 0.0000005) {
            throw new ConflictException(`El stock de ${product.name} cambió de ${item.expectedQuantity} a ${previousQuantity}. Revisa las cantidades y vuelve a guardar.`);
          }
          const newQuantity = roundQuantity(item.type === 'SET' ? item.quantity : previousQuantity + (item.type === 'INCREASE' ? item.quantity : -item.quantity));
          if (newQuantity < 0 || newQuantity > 1e12) throw new BadRequestException(`Stock insuficiente o cantidad fuera de rango para ${product.name}. Disponible: ${previousQuantity}`);
          const delta = roundQuantity(newQuantity - previousQuantity);
          if (!delta) { result.unchangedProductIds.push(item.productId); continue; }
          const adjustmentId = new Types.ObjectId();
          if (delta > 0 && (product.tracksLot || activeLots.length || item.lotNumber || item.expirationDate)) {
            const lotNumber = item.lotNumber || `ADJ-${adjustmentId.toString().toUpperCase()}`;
            const lot = await this.lots.findOne({ ...query, lotNumber }).session(session).lean();
            if (lot) {
              if (!lot.isActive && lot.currentQuantity > 0) throw new BadRequestException(`El lote ${lotNumber} está inactivo y conserva existencias. Selecciona otro lote.`);
              if (item.expirationDate && lot.expirationDate && new Date(item.expirationDate).toISOString().slice(0, 10) !== lot.expirationDate.toISOString().slice(0, 10)) throw new BadRequestException(`El vencimiento no coincide con el lote ${lotNumber}`);
              await this.lots.findOneAndUpdate({ ...query, _id: lot._id }, {
                $inc: { currentQuantity: delta, initialQuantity: delta },
                $set: { isActive: true, ...(!lot.expirationDate && item.expirationDate ? { expirationDate: new Date(item.expirationDate) } : {}) },
              }, { session });
            } else {
              await this.lots.create([{ ...query, lotNumber, expirationDate: item.expirationDate ? new Date(item.expirationDate) : undefined, initialQuantity: delta, currentQuantity: delta, receivedAt: date, isActive: true }], { session });
            }
          } else if (delta < 0) {
            // Consume FEFO; keep original received quantities and purchase references for history.
            activeLots.sort((a, b) => (a.expirationDate?.getTime() ?? Infinity) - (b.expirationDate?.getTime() ?? Infinity) || a.receivedAt.getTime() - b.receivedAt.getTime() || a._id.toString().localeCompare(b._id.toString()));
            let remaining = -delta;
            for (const lot of activeLots) {
              if (remaining <= 0) break;
              const consumed = Math.min(lot.currentQuantity, remaining);
              const currentQuantity = roundQuantity(lot.currentQuantity - consumed);
              await this.lots.findOneAndUpdate({ ...query, _id: lot._id }, { $set: { currentQuantity, isActive: currentQuantity > 0 } }, { session });
              remaining = roundQuantity(remaining - consumed);
            }
          }
          await this.stocks.findOneAndUpdate(query, { $set: { quantity: newQuantity, lastUpdated: date }, $setOnInsert: query }, { session, upsert: true });
          const type = delta > 0 ? 'INCREASE' : 'DECREASE';
          const [adjustment] = await this.model.create([{
            _id: adjustmentId, ...query, type, mode: item.type, targetQuantity: item.type === 'SET' ? item.quantity : undefined,
            requestId: input.requestId, quantity: Math.abs(delta), reason, previousQuantity, newQuantity, adjustedBy: userId, date,
          }], { session });
          await this.movements.create([{
            ...query, movementType: delta > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT', quantity: Math.abs(delta), previousStock: previousQuantity,
            newStock: newQuantity, referenceId: adjustmentId, referenceType: 'Adjustment', user: userId, date,
            description: `${item.type === 'SET' ? `Ajuste a cantidad final ${newQuantity}` : 'Ajuste'}: ${reason}`,
          }], { session });
          result.adjustments.push(this.toEntity(adjustment.toObject()));
        }
        await this.batches.create([{ ...key, payloadHash, result }], { session });
      });
      return result;
    } catch (error) {
      // A simultaneous retry may hit the unique request index after the first commit.
      if ((error as { code?: number }).code === 11000) {
        const committed = await this.batches.findOne(key).lean();
        if (committed) return replay(committed);
        throw new ConflictException('El inventario cambió mientras guardabas. Actualiza el stock y vuelve a revisar.');
      }
      throw error;
    } finally { await session.endSession(); }
  }

  async create(adjustment: StockAdjustmentEntity): Promise<StockAdjustmentEntity> {
    const created = await this.model.create({
      product: adjustment.productId,
      company: adjustment.companyId,
      branch: adjustment.branchId || undefined,
      type: adjustment.type,
      quantity: adjustment.quantity,
      reason: adjustment.reason,
      previousQuantity: adjustment.previousQuantity,
      newQuantity: adjustment.newQuantity,
      adjustedBy: adjustment.adjustedBy || undefined,
      date: adjustment.date,
    });
    return this.toEntity(created.toObject());
  }

  async findAll(
    filter?: { productId?: string; companyId?: string; branchId?: string; startDate?: Date; endDate?: Date },
    page = 1, limit = 20,
  ): Promise<{ data: StockAdjustmentEntity[]; total: number }> {
    const query: any = {};
    if (filter?.productId) query.product = filter.productId;
    if (filter?.companyId) query.company = filter.companyId;
    if (filter?.branchId) query.branch = filter.branchId;
    if (filter?.startDate || filter?.endDate) {
      query.date = {};
      if (filter.startDate) query.date.$gte = filter.startDate;
      if (filter.endDate) query.date.$lte = filter.endDate;
    }
    const [data, total] = await Promise.all([
      this.model.find(query).populate('product').populate('company').populate('adjustedBy').skip((page - 1) * limit).limit(limit).sort({ date: -1 }).lean().exec(),
      this.model.countDocuments(query).exec(),
    ]);
    return { data: data.map((d) => this.toEntity(d)), total };
  }

  private toEntity(doc: any): StockAdjustmentEntity {
    return {
      id: doc._id.toString(),
      productId: doc.product?._id?.toString() || doc.product?.toString(),
      companyId: doc.company?._id?.toString() || doc.company?.toString(),
      branchId: doc.branch?._id?.toString() || doc.branch?.toString(),
      type: doc.type,
      mode: doc.mode,
      targetQuantity: doc.targetQuantity,
      requestId: doc.requestId,
      quantity: doc.quantity,
      reason: doc.reason,
      previousQuantity: doc.previousQuantity,
      newQuantity: doc.newQuantity,
      adjustedBy: doc.adjustedBy?._id?.toString() || doc.adjustedBy?.toString(),
      date: doc.date,
      createdAt: doc.createdAt,
    };
  }
}
