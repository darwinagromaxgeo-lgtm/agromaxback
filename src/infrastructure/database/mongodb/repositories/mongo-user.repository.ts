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
    const created = await this.userModel.create(user);
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
    filter?: { search?: string; role?: string; isActive?: boolean },
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

    const [data, total] = await Promise.all([
      this.userModel.find(query).select('-password').skip((page - 1) * limit).limit(limit).sort({ createdAt: -1 }).lean().exec(),
      this.userModel.countDocuments(query).exec(),
    ]);
    return { data: data.map((d) => this.toEntity(d)), total };
  }

  async update(id: string, data: Partial<UserEntity>): Promise<UserEntity> {
    const doc = await this.userModel.findByIdAndUpdate(id, data, { new: true }).lean().exec();
    return this.toEntity(doc);
  }

  private toEntity(doc: any): UserEntity {
    return {
      id: doc._id.toString(), username: doc.username || doc.email, email: doc.email,
      password: doc.password, fullName: doc.fullName, role: doc.role, isActive: doc.isActive,
      createdAt: doc.createdAt, updatedAt: doc.updatedAt,
    };
  }
}
