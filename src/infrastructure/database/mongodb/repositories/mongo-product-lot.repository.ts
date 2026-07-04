import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IProductLotRepository } from '../../../../domain/repositories/product-lot.repository';
import { ProductLotEntity } from '../../../../domain/entities/product-lot.entity';
import { ProductLotDocument, ProductLotDoc } from '../schemas/product-lot.schema';

@Injectable()
export class MongoProductLotRepository implements IProductLotRepository {
  constructor(
    @InjectModel(ProductLotDocument.name) private readonly lotModel: Model<ProductLotDoc>,
  ) {}

  async create(lot: ProductLotEntity): Promise<ProductLotEntity> {
    const created = await this.lotModel.create({
      product: new Types.ObjectId(lot.productId),
      company: new Types.ObjectId(lot.companyId),
      lotNumber: lot.lotNumber,
      expirationDate: lot.expirationDate,
      initialQuantity: lot.initialQuantity,
      currentQuantity: lot.currentQuantity,
      purchaseId: lot.purchaseId ? new Types.ObjectId(lot.purchaseId) : undefined,
      receivedAt: lot.receivedAt,
      isActive: lot.isActive,
    });
    return this.toEntity(created.toObject());
  }

  async findByProductCompanyLot(productId: string, companyId: string, lotNumber: string): Promise<ProductLotEntity | null> {
    const doc = await this.lotModel.findOne({
      product: new Types.ObjectId(productId),
      company: new Types.ObjectId(companyId),
      lotNumber,
    }).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findByProductAndCompany(productId: string, companyId: string, activeOnly = true): Promise<ProductLotEntity[]> {
    const query: any = {
      product: new Types.ObjectId(productId),
      company: new Types.ObjectId(companyId),
    };
    if (activeOnly) query.isActive = true;
    const docs = await this.lotModel.find(query).sort({ expirationDate: 1, receivedAt: 1 }).lean().exec();
    return docs.map((d) => this.toEntity(d));
  }

  async findByProduct(productId: string, activeOnly = false): Promise<ProductLotEntity[]> {
    const query: any = { product: new Types.ObjectId(productId) };
    if (activeOnly) query.isActive = true;
    const docs = await this.lotModel.find(query).sort({ expirationDate: 1, receivedAt: 1 }).lean().exec();
    return docs.map((d) => this.toEntity(d));
  }

  async findByCompany(companyId: string, activeOnly = true): Promise<ProductLotEntity[]> {
    const query: any = { company: new Types.ObjectId(companyId) };
    if (activeOnly) query.isActive = true;
    const docs = await this.lotModel.find(query).populate('product').sort({ expirationDate: 1 }).lean().exec();
    return docs.map((d) => this.toEntity(d));
  }

  async findExpiring(companyId: string, withinDays: number): Promise<ProductLotEntity[]> {
    // Use start of today UTC so a lot expiring "today" is still considered non-expired
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    const limit = new Date(now);
    limit.setUTCDate(limit.getUTCDate() + withinDays);
    const docs = await this.lotModel.find({
      company: new Types.ObjectId(companyId),
      isActive: true,
      currentQuantity: { $gt: 0 },
      expirationDate: { $gte: now, $lte: limit },
    }).populate('product').sort({ expirationDate: 1 }).lean().exec();
    return docs.map((d) => this.toEntity(d));
  }

  async findById(id: string): Promise<ProductLotEntity | null> {
    const doc = await this.lotModel.findById(id).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findExpiredWithStock(): Promise<ProductLotEntity[]> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const docs = await this.lotModel.find({
      expirationDate: { $lt: today },
      currentQuantity: { $gt: 0 },
      isActive: true,
    }).lean().exec();
    return docs.map((d) => this.toEntity(d));
  }

  async incrementQuantity(id: string, delta: number): Promise<ProductLotEntity | null> {
    const update: any = { $inc: { currentQuantity: delta, initialQuantity: delta > 0 ? delta : 0 } };
    if (delta > 0) update.$set = { isActive: true };
    const doc = await this.lotModel.findByIdAndUpdate(id, update, { new: true }).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async consumeQuantity(id: string, qty: number): Promise<ProductLotEntity | null> {
    const doc = await this.lotModel.findByIdAndUpdate(
      id,
      { $inc: { currentQuantity: -qty } },
      { new: true },
    ).lean().exec();
    if (!doc) return null;
    if (doc.currentQuantity <= 0) {
      await this.lotModel.findByIdAndUpdate(id, { $set: { isActive: false, currentQuantity: 0 } }).exec();
      doc.isActive = false;
      doc.currentQuantity = 0;
    }
    return this.toEntity(doc);
  }

  async restoreQuantity(id: string, qty: number): Promise<ProductLotEntity | null> {
    const doc = await this.lotModel.findByIdAndUpdate(
      id,
      { $inc: { currentQuantity: qty }, $set: { isActive: true } },
      { new: true },
    ).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async adjustQuantity(id: string, delta: number): Promise<ProductLotEntity | null> {
    const update: any = { $inc: { currentQuantity: delta, initialQuantity: delta } };
    if (delta > 0) update.$set = { isActive: true };
    const doc = await this.lotModel.findByIdAndUpdate(id, update, { new: true }).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async decrementToZero(id: string, quantity: number): Promise<ProductLotEntity | null> {
    const doc = await this.lotModel.findByIdAndUpdate(
      id,
      [
        {
          $set: {
            currentQuantity: { $max: [0, { $subtract: ['$currentQuantity', quantity] }] },
            initialQuantity: { $max: [0, { $subtract: ['$initialQuantity', quantity] }] },
          },
        },
        { $set: { isActive: { $gt: ['$currentQuantity', 0] } } },
      ],
      { new: true },
    ).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async update(id: string, data: { lotNumber?: string; expirationDate?: Date | null; isActive?: boolean }): Promise<ProductLotEntity | null> {
    const $set: any = {};
    const $unset: any = {};
    if (data.lotNumber !== undefined) $set.lotNumber = data.lotNumber;
    if (data.isActive !== undefined) $set.isActive = data.isActive;
    if ('expirationDate' in data) {
      if (data.expirationDate) $set.expirationDate = data.expirationDate;
      else $unset.expirationDate = '';
    }
    const update: any = {};
    if (Object.keys($set).length) update.$set = $set;
    if (Object.keys($unset).length) update.$unset = $unset;
    const doc = await this.lotModel.findByIdAndUpdate(id, update, { new: true }).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  private toEntity(doc: any): ProductLotEntity {
    return {
      id: doc._id.toString(),
      productId: doc.product?._id?.toString() || doc.product?.toString(),
      companyId: doc.company?.toString(),
      lotNumber: doc.lotNumber,
      expirationDate: doc.expirationDate,
      initialQuantity: doc.initialQuantity,
      currentQuantity: doc.currentQuantity,
      purchaseId: doc.purchaseId?.toString(),
      receivedAt: doc.receivedAt,
      isActive: doc.isActive,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
