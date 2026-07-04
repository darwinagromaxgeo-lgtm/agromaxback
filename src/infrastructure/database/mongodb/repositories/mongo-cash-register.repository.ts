import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ICashRegisterRepository } from '../../../../domain/repositories/cash-register.repository';
import { CashRegisterEntity } from '../../../../domain/entities/cash-register.entity';
import { CashRegisterDocument, CashRegisterDoc } from '../schemas/cash-register.schema';

@Injectable()
export class MongoCashRegisterRepository implements ICashRegisterRepository {
  constructor(
    @InjectModel(CashRegisterDocument.name) private readonly model: Model<CashRegisterDoc>,
  ) {}

  async create(register: CashRegisterEntity): Promise<CashRegisterEntity> {
    const created = await this.model.create({
      date: register.date,
      openingBalance: register.openingBalance,
      status: register.status,
      entries: [],
      createdBy: register.createdBy || undefined,
    });
    return this.toEntity(created.toObject());
  }

  async findByDate(date: string): Promise<CashRegisterEntity | null> {
    const doc = await this.model.findOne({ date }).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findById(id: string): Promise<CashRegisterEntity | null> {
    const doc = await this.model.findById(id).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findAll(
    filter?: { startDate?: string; endDate?: string; status?: string },
    page = 1, limit = 20,
  ): Promise<{ data: CashRegisterEntity[]; total: number }> {
    const query: any = {};
    if (filter?.status) query.status = filter.status;
    if (filter?.startDate || filter?.endDate) {
      query.date = {};
      if (filter.startDate) query.date.$gte = filter.startDate;
      if (filter.endDate) query.date.$lte = filter.endDate;
    }
    const [data, total] = await Promise.all([
      this.model.find(query).skip((page - 1) * limit).limit(limit).sort({ date: -1 }).lean().exec(),
      this.model.countDocuments(query).exec(),
    ]);
    return { data: data.map((d) => this.toEntity(d)), total };
  }

  async update(id: string, data: Partial<CashRegisterEntity>): Promise<CashRegisterEntity | null> {
    const doc = await this.model.findByIdAndUpdate(id, { $set: data }, { new: true }).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async adjustOpeningBalance(
    id: string,
    newBalance: number,
    historyEntry: { previousAmount: number; newAmount: number; reason: string; adjustedBy?: string; adjustedAt: Date },
  ): Promise<CashRegisterEntity | null> {
    const doc = await this.model.findByIdAndUpdate(
      id,
      {
        $set: { openingBalance: newBalance },
        $push: { openingBalanceHistory: historyEntry },
      },
      { new: true },
    ).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async addEntry(id: string, entry: any): Promise<CashRegisterEntity | null> {
    const doc = await this.model.findByIdAndUpdate(id, { $push: { entries: entry } }, { new: true }).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async updateEntry(registerId: string, entryId: string, data: any): Promise<CashRegisterEntity | null> {
    const setFields: any = {};
    const pushFields: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (key === '$push') {
        for (const [pushKey, pushValue] of Object.entries(value as any)) {
          pushFields[`entries.$.${pushKey}`] = pushValue;
        }
      } else {
        setFields[`entries.$.${key}`] = value;
      }
    }
    const update: any = {};
    if (Object.keys(setFields).length > 0) update.$set = setFields;
    if (Object.keys(pushFields).length > 0) update.$push = pushFields;

    const doc = await this.model.findOneAndUpdate(
      { _id: registerId, 'entries._id': entryId },
      update,
      { new: true },
    ).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  private toEntity(doc: any): CashRegisterEntity {
    return {
      id: doc._id.toString(),
      date: doc.date,
      openingBalance: doc.openingBalance,
      openingBalanceHistory: (doc.openingBalanceHistory || []).map((h: any) => ({
        previousAmount: h.previousAmount,
        newAmount: h.newAmount,
        reason: h.reason,
        adjustedBy: h.adjustedBy?.toString(),
        adjustedAt: h.adjustedAt,
      })),
      status: doc.status,
      entries: (doc.entries || []).map((e: any) => ({
        id: e._id?.toString(),
        type: e.type,
        category: e.category,
        description: e.description,
        amount: e.amount,
        referenceId: e.referenceId?.toString(),
        referenceType: e.referenceType,
        voucherType: e.voucherType || (e.hasBoleta ? 'BOLETA' : 'NONE'),
        voucherSeries: e.voucherSeries,
        voucherNumber: e.voucherNumber,
        isDeleted: e.isDeleted || false,
        deletedBy: e.deletedBy?.toString(),
        deletedAt: e.deletedAt,
        deleteReason: e.deleteReason,
        editHistory: (e.editHistory || []).map((h: any) => ({
          previousAmount: h.previousAmount,
          newAmount: h.newAmount,
          reason: h.reason,
          editedBy: h.editedBy?.toString(),
          editedAt: h.editedAt,
        })),
        createdBy: e.createdBy?.toString(),
        createdAt: e.createdAt,
      })),
      closingBalance: doc.closingBalance,
      closedBy: doc.closedBy?.toString(),
      closedAt: doc.closedAt,
      notes: doc.notes,
      createdBy: doc.createdBy?.toString(),
      createdAt: doc.createdAt,
    };
  }
}
