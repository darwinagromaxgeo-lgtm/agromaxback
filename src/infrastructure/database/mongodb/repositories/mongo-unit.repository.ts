import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IUnitRepository } from '../../../../domain/repositories/unit.repository';
import { UnitEntity } from '../../../../domain/entities/unit.entity';
import { UnitDocument, UnitDoc } from '../schemas/unit.schema';

@Injectable()
export class MongoUnitRepository implements IUnitRepository {
  constructor(
    @InjectModel(UnitDocument.name) private readonly unitModel: Model<UnitDoc>,
  ) {}

  async create(unit: UnitEntity): Promise<UnitEntity> {
    const created = await this.unitModel.create(unit);
    return this.toEntity(created.toObject());
  }

  async findAll(): Promise<UnitEntity[]> {
    const docs = await this.unitModel.find().sort({ name: 1 }).lean().exec();
    return docs.map((d) => this.toEntity(d));
  }

  async findById(id: string): Promise<UnitEntity | null> {
    const doc = await this.unitModel.findById(id).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findByName(name: string): Promise<UnitEntity | null> {
    const doc = await this.unitModel.findOne({ name }).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async delete(id: string): Promise<void> {
    await this.unitModel.findByIdAndUpdate(id, { isActive: false }).exec();
  }

  async update(id: string, unit: Partial<UnitEntity>): Promise<UnitEntity | null> {
    const doc = await this.unitModel.findByIdAndUpdate(id, unit, { new: true }).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  private toEntity(doc: any): UnitEntity {
    return {
      id: doc._id.toString(),
      name: doc.name,
      abbreviation: doc.abbreviation,
      isActive: doc.isActive,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
