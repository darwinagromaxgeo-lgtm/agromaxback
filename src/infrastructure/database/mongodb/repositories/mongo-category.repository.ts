import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ICategoryRepository } from '../../../../domain/repositories/category.repository';
import { CategoryEntity } from '../../../../domain/entities/category.entity';
import { CategoryDocument, CategoryDoc } from '../schemas/category.schema';

@Injectable()
export class MongoCategoryRepository implements ICategoryRepository, OnModuleInit {
  constructor(
    @InjectModel(CategoryDocument.name) private readonly categoryModel: Model<CategoryDoc>,
  ) {}

  async onModuleInit() {
    try { await this.categoryModel.collection.dropIndex('name_1'); } catch { /* índice ya no existe */ }
  }

  async create(category: CategoryEntity): Promise<CategoryEntity> {
    const created = await this.categoryModel.create({
      name: category.name,
      description: category.description,
      isActive: category.isActive,
      parentId: category.parentId ? new Types.ObjectId(category.parentId) : null,
    });
    return this.toEntity(created.toObject());
  }

  async findAll(): Promise<CategoryEntity[]> {
    const docs = await this.categoryModel.find().lean().exec();
    return docs.map((d) => this.toEntity(d));
  }

  async findById(id: string): Promise<CategoryEntity | null> {
    const doc = await this.categoryModel.findById(id).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findByName(name: string): Promise<CategoryEntity | null> {
    const doc = await this.categoryModel.findOne({ name }).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findByNameAndParent(name: string, parentId: string | null): Promise<CategoryEntity | null> {
    const query: any = { name };
    if (parentId) {
      const oid = new Types.ObjectId(parentId);
      query.parentId = { $in: [oid, parentId] };
    } else {
      query.parentId = { $in: [null, undefined] };
    }
    const doc = await this.categoryModel.findOne(query).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async update(id: string, category: Partial<CategoryEntity>): Promise<CategoryEntity | null> {
    const doc = await this.categoryModel.findByIdAndUpdate(id, category, { new: true }).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async delete(id: string): Promise<void> {
    await this.categoryModel.findByIdAndDelete(id).exec();
  }

  private toEntity(doc: any): CategoryEntity {
    return {
      id: doc._id.toString(),
      name: doc.name,
      description: doc.description,
      isActive: doc.isActive,
      parentId: doc.parentId ? doc.parentId.toString() : undefined,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
