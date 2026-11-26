import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IUserRepository } from '../../../../domain/repositories/user.repository';
import { UserEntity } from '../../../../domain/entities/user.entity';
import { UserDocument, UserDoc } from '../schemas/user.schema';

@Injectable()
export class MongoUserRepository implements IUserRepository {
  constructor(
    @InjectModel(UserDocument.name) private readonly userModel: Model<UserDoc>,
  ) {}

  async create(user: UserEntity): Promise<UserEntity> {
    const created = await this.userModel.create({
      ...user,
      branchAssignments: (user.branchAssignments || []).map((assignment) => ({
        branch: assignment.branchId,
        role: assignment.role,
      })),
    });
    return this.toEntity(created.toObject());
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const doc = await this.userModel.findOne({ email }).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findByUsername(username: string): Promise<UserEntity | null> {
    const doc = await this.userModel.findOne({ $or: [{ username }, { email: username }] }).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findById(id: string): Promise<UserEntity | null> {
    const doc = await this.userModel.findById(id).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findAll(
    filter?: { search?: string; role?: string; isActive?: boolean; branchId?: string },
    page = 1,
    limit = 20,
  ): Promise<{ data: UserEntity[]; total: number }> {
    const query: any = {};
    if (filter?.search) {
      query.$or = [
        { fullName: { $regex: filter.search, $options: 'i' } },
        { username: { $regex: filter.search, $options: 'i' } },
        { email: { $regex: filter.search, $options: 'i' } },
      ];
    }
    if (filter?.role) query.role = filter.role;
    if (filter?.isActive !== undefined) query.isActive = filter.isActive;
    if (filter?.branchId) query['branchAssignments.branch'] = filter.branchId;

    const [data, total] = await Promise.all([
      this.userModel.find(query).select('-password').skip((page - 1) * limit).limit(limit).sort({ createdAt: -1 }).lean().exec(),
      this.userModel.countDocuments(query).exec(),
    ]);
    return { data: data.map((d) => this.toEntity(d)), total };
  }

  async update(id: string, data: Partial<UserEntity>): Promise<UserEntity> {
    const update: any = { ...data };
    if (data.branchAssignments !== undefined) {
      update.branchAssignments = data.branchAssignments.map((assignment) => ({
        branch: assignment.branchId,
        role: assignment.role,
      }));
    }
    const removeEmail = data.email === '';
    if (removeEmail) delete update.email;
    const doc = await this.userModel.findByIdAndUpdate(id, { $set: update, ...(removeEmail ? { $unset: { email: 1 } } : {}) }, { new: true }).lean().exec();
    return this.toEntity(doc);
  }

  private toEntity(doc: any): UserEntity {
    return {
      id: doc._id.toString(), username: doc.username || doc.email, email: doc.email,
      password: doc.password, fullName: doc.fullName, role: doc.role, isActive: doc.isActive,
      canTransferStock: doc.canTransferStock === true,
      branchAssignments: (doc.branchAssignments || []).map((assignment: any) => ({
        branchId: assignment.branch?._id?.toString() || assignment.branch?.toString(),
        role: assignment.role,
      })),
      createdAt: doc.createdAt, updatedAt: doc.updatedAt,
    };
  }
}
