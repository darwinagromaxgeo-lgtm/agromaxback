import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { applyBranchScope } from '../branch-scope.plugin';

@Schema({ _id: false })
export class SaleItemSubdoc {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ProductDocument', required: true })
  product: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'CompanyDocument', required: true })
  company: Types.ObjectId;

  @Prop({ required: true })
  quantity: number;

  @Prop({ required: true })
  priceTier: string;

  @Prop({ required: true })
  unitPrice: number;

  @Prop({ required: true })
  subtotal: number;

  @Prop()
  productName?: string;

  @Prop()
  unit?: string;

  @Prop({ enum: ['GRAVADO', 'EXONERADO', 'INAFECTO'] })
  taxType?: string;

  @Prop({ min: 0, max: 1 })
  taxRate?: number;
}

export const SaleItemSubdocSchema = SchemaFactory.createForClass(SaleItemSubdoc);

@Schema({ _id: false })
export class SalePaymentSubdoc {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'PaymentMethodDocument' })
  paymentMethod: Types.ObjectId;

  @Prop({ required: true })
  paymentMethodName: string;

  @Prop({ required: true })
  amount: number;
}

export const SalePaymentSubdocSchema = SchemaFactory.createForClass(SalePaymentSubdoc);

@Schema({ timestamps: true, collection: 'sales' })
export class SaleDocument {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'BranchDocument', required: true })
  branch: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'CompanyDocument' })
  company: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ClientDocument' })
  client: Types.ObjectId;

  @Prop({ type: [SaleItemSubdocSchema], required: true })
  items: SaleItemSubdoc[];

  @Prop({ required: true })
  total: number;

  @Prop({ default: 'NONE', enum: ['NONE', 'BOLETA', 'FACTURA'] })
  voucherType: string;

  @Prop({ default: false })
  isCredit: boolean;

  @Prop({ type: [SalePaymentSubdocSchema], default: [] })
  payments: SalePaymentSubdoc[];

  // Keep old field for retrocompatibility reads (not used for new docs)
  @Prop({ type: String })
  paymentMethod: string;

  @Prop({ default: false })
  isCancelled: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'UserDocument' })
  cancelledBy: Types.ObjectId;

  @Prop()
  cancelledAt: Date;

  @Prop()
  cancelReason: string;

  @Prop({ required: true, default: Date.now })
  date: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'UserDocument' })
  createdBy: Types.ObjectId;
}

export type SaleDoc = SaleDocument & Document;
export const SaleSchema = SchemaFactory.createForClass(SaleDocument);
applyBranchScope(SaleSchema);

SaleSchema.index({ branch: 1, company: 1, date: -1 });
SaleSchema.index({ client: 1 });
SaleSchema.index({ 'items.product': 1 });
SaleSchema.index({ isCredit: 1 });
