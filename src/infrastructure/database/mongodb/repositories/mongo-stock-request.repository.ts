import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  IStockRequestRepository,
} from '../../../../domain/repositories/stock-request.repository';
import {
  StockRequestEntity,
  StockRequestStatus,
} from '../../../../domain/entities/stock-request.entity';
import {
  StockRequestDoc,
  StockRequestDocument,
} from '../schemas/stock-request.schema';

@Injectable()
export class MongoStockRequestRepository implements IStockRequestRepository {
  constructor(
    @InjectModel(StockRequestDocument.name)
    private readonly model: Model<StockRequestDoc>,
  ) {}

  async create(request: StockRequestEntity): Promise<StockRequestEntity> {
    const created = await this.model.create(this.toPersistence(request));
    return this.findById(created.id) as Promise<StockRequestEntity>;
  }

  async findById(id: string): Promise<StockRequestEntity | null> {
    const doc = await this.withPopulation(this.model.findById(id)).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findForBranch(
    branchId: string,
    filter?: { status?: StockRequestStatus; direction?: 'incoming' | 'outgoing' },
    page = 1,
    limit = 20,
  ): Promise<{ data: StockRequestEntity[]; total: number }> {
    const query: any = {};
    if (filter?.direction === 'incoming') query.sourceBranch = branchId;
    else if (filter?.direction === 'outgoing') query.requestingBranch = branchId;
    else query.$or = [{ sourceBranch: branchId }, { requestingBranch: branchId }];
    if (filter?.status) query.status = filter.status;

    const [docs, total] = await Promise.all([
      this.withPopulation(this.model.find(query))
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.model.countDocuments(query).exec(),
    ]);
    return { data: docs.map((doc) => this.toEntity(doc)), total };
  }

  async update(
    id: string,
    data: Partial<StockRequestEntity>,
    expectedStatus?: StockRequestStatus,
  ): Promise<StockRequestEntity | null> {
    const query: any = { _id: id };
    if (expectedStatus) query.status = expectedStatus;
    const update = this.toPersistence(data);
    const doc = await this.withPopulation(
      this.model.findOneAndUpdate(query, { $set: update }, { new: true }),
    ).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  private withPopulation<T extends { populate: (...args: any[]) => any }>(query: T): T {
    return query
      .populate('requestingBranch', 'code name')
      .populate('sourceBranch', 'code name')
      .populate('items.product', 'name unit tracksLot')
      .populate('requestedBy', 'fullName username')
      .populate('reviewedBy', 'fullName username')
      .populate('dispatchedBy', 'fullName username')
      .populate('receivedBy', 'fullName username') as T;
  }

  private toPersistence(request: Partial<StockRequestEntity>): any {
    const result: any = {};
    if (request.requestingBranchId !== undefined) result.requestingBranch = request.requestingBranchId;
    if (request.sourceBranchId !== undefined) result.sourceBranch = request.sourceBranchId;
    if (request.companyId !== undefined) result.company = request.companyId;
    if (request.items !== undefined) {
      result.items = request.items.map((item) => ({
        product: item.productId,
        requestedQuantity: item.requestedQuantity,
        approvedQuantity: item.approvedQuantity,
        lotAllocations: item.lotAllocations || [],
      }));
    }
    for (const key of [
      'status', 'notes', 'rejectionReason', 'requestedBy', 'reviewedBy', 'reviewedAt',
      'dispatchedBy', 'dispatchedAt', 'receivedBy', 'receivedAt', 'cancelledBy',
      'cancelledAt',
    ]) {
      if ((request as any)[key] !== undefined) result[key] = (request as any)[key];
    }
    return result;
  }

  private toEntity(doc: any): StockRequestEntity {
    const userName = (user: any) => user?.fullName || user?.username;
    return {
      id: doc._id.toString(),
      requestingBranchId: doc.requestingBranch?._id?.toString() || doc.requestingBranch.toString(),
      requestingBranchName: doc.requestingBranch?.name,
      sourceBranchId: doc.sourceBranch?._id?.toString() || doc.sourceBranch.toString(),
      sourceBranchName: doc.sourceBranch?.name,
      companyId: doc.company?._id?.toString() || doc.company.toString(),
      items: (doc.items || []).map((item: any) => ({
        productId: item.product?._id?.toString() || item.product.toString(),
        productName: item.product?.name,
        requestedQuantity: item.requestedQuantity,
        approvedQuantity: item.approvedQuantity,
        lotAllocations: (item.lotAllocations || []).map((allocation: any) => ({
          lotNumber: allocation.lotNumber,
          expirationDate: allocation.expirationDate,
          quantity: allocation.quantity,
        })),
      })),
      status: doc.status,
      notes: doc.notes,
      rejectionReason: doc.rejectionReason,
      requestedBy: doc.requestedBy?._id?.toString() || doc.requestedBy?.toString(),
      requestedByName: userName(doc.requestedBy),
      reviewedBy: doc.reviewedBy?._id?.toString() || doc.reviewedBy?.toString(),
      reviewedByName: userName(doc.reviewedBy),
      reviewedAt: doc.reviewedAt,
      dispatchedBy: doc.dispatchedBy?._id?.toString() || doc.dispatchedBy?.toString(),
      dispatchedByName: userName(doc.dispatchedBy),
      dispatchedAt: doc.dispatchedAt,
      receivedBy: doc.receivedBy?._id?.toString() || doc.receivedBy?.toString(),
      receivedByName: userName(doc.receivedBy),
      receivedAt: doc.receivedAt,
      cancelledBy: doc.cancelledBy?.toString(),
      cancelledAt: doc.cancelledAt,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
