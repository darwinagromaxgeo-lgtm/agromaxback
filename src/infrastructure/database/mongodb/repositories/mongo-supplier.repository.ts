import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ISupplierRepository } from '../../../../domain/repositories/supplier.repository';
import { SupplierEntity } from '../../../../domain/entities/supplier.entity';
import { SupplierDocument, SupplierDoc } from '../schemas/supplier.schema';

@Injectable()
export class MongoSupplierRepository implements ISupplierRepository {
  constructor(
    @InjectModel(SupplierDocument.name) private readonly supplierModel: Model<SupplierDoc>,
  ) {}

  async create(supplier: SupplierEntity): Promise<SupplierEntity> {
    const created = await this.supplierModel.create(supplier);
    return this.toEntity(created.toObject());
  }

  async findAll(
    filter?: { search?: string; isActive?: boolean },
    page = 1, limit = 20,
  ): Promise<{ data: SupplierEntity[]; total: number }> {
    const query: any = {};
    if (filter?.search) {
      query.$or = [
        { businessName: { $regex: filter.search, $options: 'i' } },
        { ruc: { $regex: filter.search, $options: 'i' } },
      ];
    }
    if (filter?.isActive !== undefined) query.isActive = filter.isActive;
    const [data, total] = await Promise.all([
      this.supplierModel.find(query).skip((page - 1) * limit).limit(limit).sort({ createdAt: -1 }).lean().exec(),
      this.supplierModel.countDocuments(query).exec(),
    ]);
    return { data: data.map((d) => this.toEntity(d)), total };
  }

  async findById(id: string): Promise<SupplierEntity | null> {
    const doc = await this.supplierModel.findById(id).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findByRuc(ruc: string): Promise<SupplierEntity | null> {
    const doc = await this.supplierModel.findOne({ ruc }).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async update(id: string, supplier: Partial<SupplierEntity>): Promise<SupplierEntity | null> {
    const doc = await this.supplierModel.findByIdAndUpdate(id, supplier, { new: true }).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  private toEntity(doc: any): SupplierEntity {
    return {
      id: doc._id.toString(), ruc: doc.ruc, businessName: doc.businessName,
      address: doc.address, phone: doc.phone,
      isActive: doc.isActive, createdAt: doc.createdAt, updatedAt: doc.updatedAt,
    };
  }
}
