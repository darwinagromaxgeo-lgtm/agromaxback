import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IPriceTierRepository } from '../../../../domain/repositories/price-tier.repository';
import { PriceTierEntity } from '../../../../domain/entities/price-range.entity';
import { PriceTierDocument, PriceTierDoc } from '../schemas/price-tier.schema';

@Injectable()
export class MongoPriceTierRepository implements IPriceTierRepository {
  constructor(
    @InjectModel(PriceTierDocument.name) private readonly priceTierModel: Model<PriceTierDoc>,
  ) {}

  async create(tier: PriceTierEntity): Promise<PriceTierEntity> {
    const created = await this.priceTierModel.create(tier);
    return this.toEntity(created.toObject());
  }

  async findAll(filter?: { isActive?: boolean }): Promise<PriceTierEntity[]> {
    const query: any = {};
    if (filter?.isActive !== undefined) query.isActive = filter.isActive;
    const docs = await this.priceTierModel.find(query).sort({ priority: 1 }).lean().exec();
    return docs.map((d) => this.toEntity(d));
  }

  async findById(id: string): Promise<PriceTierEntity | null> {
    const doc = await this.priceTierModel.findById(id).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async update(id: string, tier: Partial<PriceTierEntity>): Promise<PriceTierEntity | null> {
    const doc = await this.priceTierModel.findByIdAndUpdate(id, tier, { new: true }).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findByName(name: string): Promise<PriceTierEntity | null> {
    const doc = await this.priceTierModel.findOne({ name }).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  private toEntity(doc: any): PriceTierEntity {
    return {
      id: doc._id.toString(), name: doc.name, description: doc.description,
      priority: doc.priority, isActive: doc.isActive, createdAt: doc.createdAt,
    };
  }
}
