import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IPaymentMethodRepository } from '../../../../domain/repositories/payment-method.repository';
import { PaymentMethodEntity } from '../../../../domain/entities/payment-method.entity';
import { PaymentMethodDocument, PaymentMethodDoc } from '../schemas/payment-method.schema';

@Injectable()
export class MongoPaymentMethodRepository implements IPaymentMethodRepository {
  constructor(
    @InjectModel(PaymentMethodDocument.name) private readonly paymentMethodModel: Model<PaymentMethodDoc>,
  ) {}

  async create(paymentMethod: PaymentMethodEntity): Promise<PaymentMethodEntity> {
    const created = await this.paymentMethodModel.create(paymentMethod);
    return this.toEntity(created.toObject());
  }

  async findAll(): Promise<PaymentMethodEntity[]> {
    const docs = await this.paymentMethodModel.find().lean().exec();
    return docs.map((d) => this.toEntity(d));
  }

  async findById(id: string): Promise<PaymentMethodEntity | null> {
    const doc = await this.paymentMethodModel.findById(id).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findByName(name: string): Promise<PaymentMethodEntity | null> {
    const doc = await this.paymentMethodModel.findOne({ name }).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async update(id: string, paymentMethod: Partial<PaymentMethodEntity>): Promise<PaymentMethodEntity | null> {
    const doc = await this.paymentMethodModel.findByIdAndUpdate(id, paymentMethod, { new: true }).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  private toEntity(doc: any): PaymentMethodEntity {
    return {
      id: doc._id.toString(),
      name: doc.name,
      isActive: doc.isActive,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
