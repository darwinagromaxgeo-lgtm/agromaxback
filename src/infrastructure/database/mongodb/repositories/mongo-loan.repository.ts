import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ILoanRepository } from '../../../../domain/repositories/loan.repository';
import { LoanEntity } from '../../../../domain/entities/loan.entity';
import { LoanDocument, LoanDoc } from '../schemas/loan.schema';

@Injectable()
export class MongoLoanRepository implements ILoanRepository {
  constructor(
    @InjectModel(LoanDocument.name) private readonly loanModel: Model<LoanDoc>,
  ) {}

  async create(loan: LoanEntity): Promise<LoanEntity> {
    const created = await this.loanModel.create({
      borrowerName: loan.borrowerName,
      items: loan.items.map((i) => ({
        product: i.productId,
        company: i.companyId,
        quantity: i.quantity,
        returnedQuantity: i.returnedQuantity || 0,
      })),
      status: loan.status || 'ACTIVE',
      returns: [],
      notes: loan.notes,
      date: loan.date,
      createdBy: loan.createdBy || undefined,
    });
    return this.toEntity(created.toObject());
  }

  async findById(id: string): Promise<LoanEntity | null> {
    const doc = await this.loanModel
      .findById(id)
      .populate('items.product')
      .populate('items.company')
      .populate('returns.items.product')
      .populate('returns.items.company')
      .lean()
      .exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findAll(
    filter?: { borrowerName?: string; status?: string; startDate?: Date; endDate?: Date },
    page = 1,
    limit = 20,
  ): Promise<{ data: LoanEntity[]; total: number }> {
    const query: any = {};
    if (filter?.borrowerName) query.borrowerName = { $regex: filter.borrowerName, $options: 'i' };
    if (filter?.status) query.status = filter.status;
    if (filter?.startDate || filter?.endDate) {
      query.date = {};
      if (filter.startDate) query.date.$gte = filter.startDate;
      if (filter.endDate) query.date.$lte = filter.endDate;
    }

    const [data, total] = await Promise.all([
      this.loanModel
        .find(query)
        .populate('items.product')
        .populate('items.company')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ date: -1 })
        .lean()
        .exec(),
      this.loanModel.countDocuments(query).exec(),
    ]);

    return { data: data.map((d) => this.toEntity(d)), total };
  }

  async update(id: string, data: Partial<LoanEntity>): Promise<LoanEntity | null> {
    const updateData: any = {};
    if (data.status) updateData.status = data.status;
    if (data.items) {
      updateData.items = data.items.map((i) => ({
        product: i.productId,
        company: i.companyId,
        quantity: i.quantity,
        returnedQuantity: i.returnedQuantity,
      }));
    }

    const doc = await this.loanModel
      .findByIdAndUpdate(id, { $set: updateData }, { new: true })
      .populate('items.product')
      .populate('items.company')
      .populate('returns.items.product')
      .populate('returns.items.company')
      .lean()
      .exec();
    return doc ? this.toEntity(doc) : null;
  }

  async addReturn(id: string, returnData: any): Promise<LoanEntity | null> {
    const doc = await this.loanModel
      .findByIdAndUpdate(
        id,
        {
          $push: {
            returns: {
              items: returnData.items.map((i: any) => ({
                product: i.productId,
                company: i.companyId,
                quantity: i.quantity,
              })),
              notes: returnData.notes,
              returnedBy: returnData.returnedBy,
              date: returnData.date || new Date(),
            },
          },
        },
        { new: true },
      )
      .populate('items.product')
      .populate('items.company')
      .populate('returns.items.product')
      .populate('returns.items.company')
      .lean()
      .exec();
    return doc ? this.toEntity(doc) : null;
  }

  private toEntity(doc: any): LoanEntity {
    return {
      id: doc._id.toString(),
      borrowerName: doc.borrowerName,
      items: (doc.items || []).map((i: any) => ({
        productId: i.product?._id?.toString() || i.product?.toString(),
        productName: i.product?.name,
        companyId: i.company?._id?.toString() || i.company?.toString(),
        companyName: i.company?.name,
        quantity: i.quantity,
        returnedQuantity: i.returnedQuantity || 0,
      })),
      status: doc.status,
      returns: (doc.returns || []).map((r: any) => ({
        id: r._id?.toString(),
        items: (r.items || []).map((ri: any) => ({
          productId: ri.product?._id?.toString() || ri.product?.toString(),
          productName: ri.product?.name,
          companyId: ri.company?._id?.toString() || ri.company?.toString(),
          companyName: ri.company?.name,
          quantity: ri.quantity,
        })),
        notes: r.notes,
        returnedBy: r.returnedBy?.toString(),
        date: r.date,
      })),
      notes: doc.notes,
      date: doc.date,
      createdBy: doc.createdBy?.toString(),
      createdAt: doc.createdAt,
    };
  }
}
