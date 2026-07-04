import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IStockTransferRepository } from '../../../../domain/repositories/stock-transfer.repository';
import { StockTransferEntity } from '../../../../domain/entities/stock-transfer.entity';
import { StockTransferDocument, StockTransferDoc } from '../schemas/stock-transfer.schema';

@Injectable()
export class MongoStockTransferRepository implements IStockTransferRepository {
  constructor(
    @InjectModel(StockTransferDocument.name) private readonly transferModel: Model<StockTransferDoc>,
  ) {}

  async create(transfer: StockTransferEntity): Promise<StockTransferEntity> {
    const created = await this.transferModel.create({
      fromCompany: transfer.fromCompanyId, toCompany: transfer.toCompanyId,
      items: transfer.items.map((i) => ({ product: i.productId, quantity: i.quantity })),
      notes: transfer.notes, transferredBy: transfer.transferredBy, date: transfer.date,
    });
    return this.toEntity(created.toObject());
  }

  async findAll(
    filter?: { fromCompanyId?: string; toCompanyId?: string; startDate?: Date; endDate?: Date },
    page = 1, limit = 20,
  ): Promise<{ data: StockTransferEntity[]; total: number }> {
    const query: any = {};
    if (filter?.fromCompanyId) query.fromCompany = filter.fromCompanyId;
    if (filter?.toCompanyId) query.toCompany = filter.toCompanyId;
    if (filter?.startDate || filter?.endDate) {
      query.date = {};
      if (filter.startDate) query.date.$gte = filter.startDate;
      if (filter.endDate) query.date.$lte = filter.endDate;
    }
    const [data, total] = await Promise.all([
      this.transferModel.find(query).populate('fromCompany').populate('toCompany').populate('items.product').skip((page - 1) * limit).limit(limit).sort({ date: -1 }).lean().exec(),
      this.transferModel.countDocuments(query).exec(),
    ]);
    return { data: data.map((d) => this.toEntity(d)), total };
  }

  async findById(id: string): Promise<StockTransferEntity | null> {
    const doc = await this.transferModel.findById(id).populate('fromCompany').populate('toCompany').populate('items.product').lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  private toEntity(doc: any): StockTransferEntity {
    return {
      id: doc._id.toString(),
      fromCompanyId: doc.fromCompany?._id?.toString() || doc.fromCompany?.toString(),
      toCompanyId: doc.toCompany?._id?.toString() || doc.toCompany?.toString(),
      items: (doc.items || []).map((i: any) => ({
        productId: i.product?._id?.toString() || i.product?.toString(), quantity: i.quantity,
      })),
      notes: doc.notes, transferredBy: doc.transferredBy?.toString(),
      date: doc.date, createdAt: doc.createdAt,
    };
  }
}
