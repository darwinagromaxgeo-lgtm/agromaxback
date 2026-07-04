import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ICompanyRepository } from '../../../../domain/repositories/company.repository';
import { CompanyEntity } from '../../../../domain/entities/company.entity';
import { CompanyDocument, CompanyDoc } from '../schemas/company.schema';

@Injectable()
export class MongoCompanyRepository implements ICompanyRepository {
  constructor(
    @InjectModel(CompanyDocument.name) private readonly companyModel: Model<CompanyDoc>,
  ) {}

  async create(company: CompanyEntity): Promise<CompanyEntity> {
    const created = await this.companyModel.create(company);
    return this.toEntity(created.toObject());
  }

  async findAll(): Promise<CompanyEntity[]> {
    const docs = await this.companyModel.find().lean().exec();
    return docs.map((d) => this.toEntity(d));
  }

  async findById(id: string): Promise<CompanyEntity | null> {
    const doc = await this.companyModel.findById(id).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async update(id: string, company: Partial<CompanyEntity>): Promise<CompanyEntity | null> {
    const doc = await this.companyModel.findByIdAndUpdate(id, company, { new: true }).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async delete(id: string): Promise<void> {
    await this.companyModel.findByIdAndUpdate(id, { isActive: false }).exec();
  }

  async findByRuc(ruc: string): Promise<CompanyEntity | null> {
    const doc = await this.companyModel.findOne({ ruc }).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  private toEntity(doc: any): CompanyEntity {
    return {
      id: doc._id.toString(), name: doc.name, ruc: doc.ruc,
      address: doc.address, phone: doc.phone, isActive: doc.isActive,
      createdAt: doc.createdAt, updatedAt: doc.updatedAt,
    };
  }
}
