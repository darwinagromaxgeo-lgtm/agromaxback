import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BranchEntity } from '../../../../domain/entities/branch.entity';
import { BRANCH_REPOSITORY, IBranchRepository } from '../../../../domain/repositories/branch.repository';
import { BranchDoc, BranchDocument } from '../schemas/branch.schema';

@Injectable()
export class MongoBranchRepository implements IBranchRepository {
  constructor(
    @InjectModel(BranchDocument.name) private readonly model: Model<BranchDoc>,
  ) {}

  async create(branch: BranchEntity): Promise<BranchEntity> {
    const created = await this.model.create({
      code: branch.code.trim().toUpperCase(),
      name: branch.name.trim(),
      address: branch.address,
      phone: branch.phone,
      billingSeriesCode: branch.billingSeriesCode,
      sunatEstablishmentCode: branch.sunatEstablishmentCode,
      companies: branch.companyIds.map((id) => new Types.ObjectId(id)),
      defaultCompany: branch.defaultCompanyId ? new Types.ObjectId(branch.defaultCompanyId) : undefined,
      isActive: branch.isActive,
      isMain: branch.isMain,
    });
    return this.toEntity(created.toObject());
  }

  async findAll(activeOnly = false): Promise<BranchEntity[]> {
    const query = activeOnly ? { isActive: true } : {};
    const docs = await this.model.find(query).sort({ isMain: -1, name: 1 }).lean().exec();
    return docs.map((doc) => this.toEntity(doc));
  }

  async findById(id: string): Promise<BranchEntity | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model.findById(id).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findByCode(code: string): Promise<BranchEntity | null> {
    const doc = await this.model.findOne({ code: code.trim().toUpperCase() }).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findByIds(ids: string[], activeOnly = true): Promise<BranchEntity[]> {
    const validIds = ids.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
    if (validIds.length === 0) return [];
    const query: any = { _id: { $in: validIds } };
    if (activeOnly) query.isActive = true;
    const docs = await this.model.find(query).sort({ isMain: -1, name: 1 }).lean().exec();
    return docs.map((doc) => this.toEntity(doc));
  }

  async update(id: string, data: Partial<BranchEntity>): Promise<BranchEntity | null> {
    const update: any = { ...data };
    delete update.id;
    if (data.code !== undefined) update.code = data.code.trim().toUpperCase();
    if (data.name !== undefined) update.name = data.name.trim();
    if (data.companyIds !== undefined) {
      update.companies = data.companyIds.map((companyId) => new Types.ObjectId(companyId));
      delete update.companyIds;
    }
    if (data.defaultCompanyId !== undefined) {
      update.defaultCompany = data.defaultCompanyId ? new Types.ObjectId(data.defaultCompanyId) : null;
      delete update.defaultCompanyId;
    }
    const filter: any = { _id: id };
    if (data.billingSeriesCode !== undefined) filter.$or = [
      { billingSeriesCode: { $exists: false } }, { billingSeriesCode: null }, { billingSeriesCode: data.billingSeriesCode },
    ];
    const doc = await this.model.findOneAndUpdate(filter, { $set: update }, { new: true, runValidators: true }).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  private toEntity(doc: any): BranchEntity {
    return {
      id: doc._id.toString(),
      code: doc.code,
      name: doc.name,
      address: doc.address,
      phone: doc.phone,
      billingSeriesCode: doc.billingSeriesCode,
      sunatEstablishmentCode: doc.sunatEstablishmentCode,
      companyIds: (doc.companies || []).map((company: any) => company?._id?.toString() || company.toString()),
      defaultCompanyId: doc.defaultCompany?._id?.toString() || doc.defaultCompany?.toString(),
      isActive: doc.isActive !== false,
      isMain: doc.isMain === true,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
