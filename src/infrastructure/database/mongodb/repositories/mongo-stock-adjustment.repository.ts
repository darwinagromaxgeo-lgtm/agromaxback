import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IStockAdjustmentRepository } from '../../../../domain/repositories/stock-adjustment.repository';
import { StockAdjustmentEntity } from '../../../../domain/entities/stock-adjustment.entity';
import { StockAdjustmentDocument, StockAdjustmentDoc } from '../schemas/stock-adjustment.schema';

@Injectable()
export class MongoStockAdjustmentRepository implements IStockAdjustmentRepository {
  constructor(
    @InjectModel(StockAdjustmentDocument.name) private readonly model: Model<StockAdjustmentDoc>,
  ) {}

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
