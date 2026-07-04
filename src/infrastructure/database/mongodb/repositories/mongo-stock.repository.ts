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

  async findByProductAndCompany(productId: string, companyId: string): Promise<StockEntity | null> {
    const doc = await this.stockModel.findOne({
      product: new Types.ObjectId(productId),
      company: new Types.ObjectId(companyId),
    }).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findByCompany(companyId: string, page = 1, limit = 20): Promise<{ data: StockEntity[]; total: number }> {
    const query = { company: new Types.ObjectId(companyId) };
    const [data, total] = await Promise.all([
      this.stockModel.find(query).populate('product').skip((page - 1) * limit).limit(limit).lean().exec(),
      this.stockModel.countDocuments(query).exec(),
    ]);
    return { data: data.map((d) => this.toEntity(d)), total };
  }

  async findByProduct(productId: string): Promise<StockEntity[]> {
    const docs = await this.stockModel.find({ product: new Types.ObjectId(productId) }).lean().exec();
    return docs.map((d) => this.toEntity(d));
  }

  async upsert(productId: string, companyId: string, quantityChange: number): Promise<StockEntity> {
    // Buscar primero el documento existente
    const existing = await this.stockModel.findOne({
      product: new Types.ObjectId(productId),
      company: new Types.ObjectId(companyId),
    }).lean().exec();

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
      quantity: quantityChange,
      lastUpdated: new Date(),
    });
    return this.toEntity(created.toObject());
  }

  async decrementToZero(productId: string, companyId: string, quantity: number): Promise<StockEntity | null> {
    const doc = await this.stockModel.findOneAndUpdate(
      {
        product: new Types.ObjectId(productId),
        company: new Types.ObjectId(companyId),
      },
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

  async findAll(): Promise<StockEntity[]> {
    const docs = await this.stockModel.find({ quantity: { $gt: 0 } }).lean().exec();
    return docs.map((d) => this.toEntity(d));
  }

  async getLowStock(companyId: string, threshold: number): Promise<StockEntity[]> {
    const docs = await this.stockModel.find({
      company: new Types.ObjectId(companyId),
      quantity: { $lte: threshold },
    }).populate('product').lean().exec();
    return docs.map((d) => this.toEntity(d));
  }

  private toEntity(doc: any): StockEntity {
    return {
      id: doc._id.toString(),
      productId: doc.product?._id?.toString() || doc.product?.toString(),
      companyId: doc.company?.toString(),
      quantity: doc.quantity,
      lastUpdated: doc.lastUpdated,
    };
  }
}
