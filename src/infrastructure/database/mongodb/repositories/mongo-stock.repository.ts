import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IStockRepository } from '../../../../domain/repositories/stock.repository';
import { StockEntity } from '../../../../domain/entities/stock.entity';
import { StockDocument, StockDoc } from '../schemas/stock.schema';

@Injectable()
export class MongoStockRepository implements IStockRepository {
  constructor(
    @InjectModel(StockDocument.name) private readonly stockModel: Model<StockDoc>,
  ) {}

  async findByProductAndCompany(productId: string, companyId: string, branchId?: string): Promise<StockEntity | null> {
    const query: any = {
      product: new Types.ObjectId(productId),
      company: new Types.ObjectId(companyId),
    };
    if (branchId) query.branch = new Types.ObjectId(branchId);
    const doc = await this.stockModel.findOne(query).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findByCompany(companyId: string, page = 1, limit = 20, branchId?: string): Promise<{ data: StockEntity[]; total: number }> {
    const query: any = { company: new Types.ObjectId(companyId) };
    if (branchId) query.branch = new Types.ObjectId(branchId);
    const [data, total] = await Promise.all([
      this.stockModel.find(query).populate('product').skip((page - 1) * limit).limit(limit).lean().exec(),
      this.stockModel.countDocuments(query).exec(),
    ]);
    return { data: data.map((d) => this.toEntity(d)), total };
  }

  async findByProduct(productId: string, branchId?: string): Promise<StockEntity[]> {
    const query: any = { product: new Types.ObjectId(productId) };
    if (branchId) query.branch = new Types.ObjectId(branchId);
    const docs = await this.stockModel.find(query).lean().exec();
    return docs.map((d) => this.toEntity(d));
  }

  async upsert(productId: string, companyId: string, quantityChange: number, branchId?: string): Promise<StockEntity> {
    // Buscar primero el documento existente
    const query: any = {
      product: new Types.ObjectId(productId),
      company: new Types.ObjectId(companyId),
    };
    if (branchId) query.branch = new Types.ObjectId(branchId);
    const existing = await this.stockModel.findOne(query).lean().exec();

    if (existing) {
      // Actualizar por _id: garantiza que siempre se actualiza el mismo documento
      const updated = await this.stockModel.findByIdAndUpdate(
        existing._id,
        { $inc: { quantity: quantityChange }, $set: { lastUpdated: new Date() } },
        { new: true },
      ).lean().exec();
      return this.toEntity(updated);
    }

    // Solo crear si realmente no existe
    const created = await this.stockModel.create({
      product: new Types.ObjectId(productId),
      company: new Types.ObjectId(companyId),
      branch: branchId ? new Types.ObjectId(branchId) : undefined,
      quantity: quantityChange,
      lastUpdated: new Date(),
    });
    return this.toEntity(created.toObject());
  }

  async decrementToZero(productId: string, companyId: string, quantity: number, branchId?: string): Promise<StockEntity | null> {
    const query: any = {
      product: new Types.ObjectId(productId),
      company: new Types.ObjectId(companyId),
    };
    if (branchId) query.branch = new Types.ObjectId(branchId);
    const doc = await this.stockModel.findOneAndUpdate(
      query,
      [
        {
          $set: {
            quantity: { $max: [0, { $subtract: ['$quantity', quantity] }] },
            lastUpdated: new Date(),
          },
        },
      ],
      { new: true },
    ).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findAll(branchId?: string): Promise<StockEntity[]> {
    const query: any = { quantity: { $gt: 0 } };
    if (branchId) query.branch = new Types.ObjectId(branchId);
    const docs = await this.stockModel.find(query).lean().exec();
    return docs.map((d) => this.toEntity(d));
  }

  async getLowStock(companyId: string, threshold: number, branchId?: string): Promise<StockEntity[]> {
    const query: any = {
      company: new Types.ObjectId(companyId),
      quantity: { $lte: threshold },
    };
    if (branchId) query.branch = new Types.ObjectId(branchId);
    const docs = await this.stockModel.find(query).populate('product').lean().exec();
    return docs.map((d) => this.toEntity(d));
  }

  private toEntity(doc: any): StockEntity {
    return {
      id: doc._id.toString(),
      productId: doc.product?._id?.toString() || doc.product?.toString(),
      companyId: doc.company?.toString(),
      branchId: doc.branch?._id?.toString() || doc.branch?.toString(),
      quantity: doc.quantity,
      lastUpdated: doc.lastUpdated,
    };
  }
}
