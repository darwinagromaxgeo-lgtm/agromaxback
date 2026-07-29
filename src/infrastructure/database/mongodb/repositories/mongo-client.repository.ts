import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IClientRepository } from '../../../../domain/repositories/client.repository';
import { ClientEntity } from '../../../../domain/entities/client.entity';
import { ClientDocument, ClientDoc } from '../schemas/client.schema';

@Injectable()
export class MongoClientRepository implements IClientRepository {
  constructor(
    @InjectModel(ClientDocument.name) private readonly clientModel: Model<ClientDoc>,
  ) {}

  async create(client: ClientEntity): Promise<ClientEntity> {
    const created = await this.clientModel.create({
      branch: new Types.ObjectId(client.branchId),
      name: client.name.trim(),
      documentNumber: client.documentNumber?.trim() || undefined,
      phone: client.phone,
      email: client.email,
      address: client.address,
      isActive: client.isActive,
    });
    return this.toEntity(created.toObject());
  }

  async findAll(
    filter?: { search?: string; isActive?: boolean },
    page = 1, limit = 20,
  ): Promise<{ data: ClientEntity[]; total: number }> {
    const query: any = {};
    if (filter?.search) {
      query.$or = [
        { name: { $regex: filter.search, $options: 'i' } },
        { documentNumber: { $regex: filter.search, $options: 'i' } },
      ];
    }
    if (filter?.isActive !== undefined) query.isActive = filter.isActive;
    const [data, total] = await Promise.all([
      this.clientModel.find(query).skip((page - 1) * limit).limit(limit).sort({ createdAt: -1 }).lean().exec(),
      this.clientModel.countDocuments(query).exec(),
    ]);
    return { data: data.map((d) => this.toEntity(d)), total };
  }

  async findById(id: string): Promise<ClientEntity | null> {
    const doc = await this.clientModel.findById(id).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async update(id: string, client: Partial<ClientEntity>): Promise<ClientEntity | null> {
    const update: Record<string, any> = { ...client };
    delete update.id;
    delete update.branchId;

    const unset: Record<string, 1> = {};
    if (Object.prototype.hasOwnProperty.call(update, 'documentNumber')) {
      update.documentNumber = update.documentNumber?.trim();
      if (!update.documentNumber) {
        delete update.documentNumber;
        unset.documentNumber = 1;
      }
    }
    if (typeof update.name === 'string') update.name = update.name.trim();

    const doc = await this.clientModel
      .findByIdAndUpdate(
        id,
        {
          ...(Object.keys(update).length ? { $set: update } : {}),
          ...(Object.keys(unset).length ? { $unset: unset } : {}),
        },
        { new: true },
      )
      .lean()
      .exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findByDocumentNumber(documentNumber: string): Promise<ClientEntity | null> {
    const doc = await this.clientModel.findOne({ documentNumber }).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  private toEntity(doc: any): ClientEntity {
    return {
      id: doc._id.toString(),
      branchId: doc.branch?._id?.toString() || doc.branch?.toString(),
      name: doc.name, documentNumber: doc.documentNumber,
      phone: doc.phone, email: doc.email, address: doc.address,
      isActive: doc.isActive, createdAt: doc.createdAt, updatedAt: doc.updatedAt,
    };
  }
}
