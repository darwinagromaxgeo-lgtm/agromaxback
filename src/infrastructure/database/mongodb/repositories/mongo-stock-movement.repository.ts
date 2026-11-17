import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IStockMovementRepository } from '../../../../domain/repositories/stock-movement.repository';
import { StockMovementEntity } from '../../../../domain/entities/stock-movement.entity';
import { StockMovementDocument, StockMovementDoc } from '../schemas/stock-movement.schema';

@Injectable()
export class MongoStockMovementRepository implements IStockMovementRepository {
  constructor(
    @InjectModel(StockMovementDocument.name) private readonly model: Model<StockMovementDoc>,
  ) {}

  async create(movement: StockMovementEntity): Promise<StockMovementEntity> {
    const created = await this.model.create({
      product: movement.productId,
      company: movement.companyId,
      branch: movement.branchId || undefined,
      movementType: movement.movementType,
      quantity: movement.quantity,
      previousStock: movement.previousStock,
      newStock: movement.newStock,
      referenceId: movement.referenceId || undefined,
      referenceType: movement.referenceType || undefined,
      description: movement.description,
      user: movement.userId || undefined,
      date: movement.date,
    });
    return this.toEntity(created.toObject());
  }

  async findAll(
    filter?: {
      productId?: string;
      companyId?: string;
      branchId?: string;
      movementType?: string;
      startDate?: Date;
      endDate?: Date;
    },
    page = 1,
    limit = 20,
  ): Promise<{ data: StockMovementEntity[]; total: number }> {
    const query: any = {};
    if (filter?.productId) query.product = filter.productId;
    if (filter?.companyId) query.company = filter.companyId;
    if (filter?.branchId) query.branch = filter.branchId;
    if (filter?.movementType) query.movementType = filter.movementType;
    if (filter?.startDate || filter?.endDate) {
      query.date = {};
      if (filter.startDate) query.date.$gte = filter.startDate;
      if (filter.endDate) query.date.$lte = filter.endDate;
    }

    const [data, total] = await Promise.all([
      this.model
        .find(query)
        .populate('product', 'name unit')
        .populate('company', 'name')
        .populate('user', 'fullName')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ date: -1, createdAt: -1, _id: -1 })
        .lean()
        .exec(),
      this.model.countDocuments(query).exec(),
    ]);

    return { data: data.map((d) => this.toEntity(d)), total };
  }

  private toEntity(doc: any): StockMovementEntity {
    return {
      id: doc._id.toString(),
      productId: doc.product?._id?.toString() || doc.product?.toString(),
      productName: doc.product?.name,
      companyId: doc.company?._id?.toString() || doc.company?.toString(),
      branchId: doc.branch?._id?.toString() || doc.branch?.toString(),
      movementType: doc.movementType,
      quantity: doc.quantity,
      previousStock: doc.previousStock,
      newStock: doc.newStock,
      referenceId: doc.referenceId?.toString(),
      referenceType: doc.referenceType,
      description: doc.description,
      userId: doc.user?._id?.toString() || doc.user?.toString(),
      date: doc.date,
      createdAt: doc.createdAt,
    };
  }
}
