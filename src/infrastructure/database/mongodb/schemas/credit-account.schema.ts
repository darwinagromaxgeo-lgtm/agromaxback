import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class CreditPaymentSubdoc {
  @Prop({ required: true })
  amount: number;

  @Prop({ required: true, default: Date.now })
  paymentDate: Date;

  @Prop({ type: Types.ObjectId })
  cashRegisterEntryId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'PaymentMethodDocument' })
  paymentMethod: Types.ObjectId;

  @Prop()
  paymentMethodName: string;

  @Prop()
  notes: string;

  @Prop({ type: Types.ObjectId, ref: 'UserDocument' })
  receivedBy: Types.ObjectId;
}

export const CreditPaymentSubdocSchema = SchemaFactory.createForClass(CreditPaymentSubdoc);

@Schema({ timestamps: true, collection: 'credit_accounts' })
export class CreditAccountDocument {
  @Prop({ type: Types.ObjectId, ref: 'ClientDocument', required: true })
  client: Types.ObjectId;

  @Prop()
  name: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'SaleDocument' }], default: [] })
  sales: Types.ObjectId[];

  @Prop({ required: true })
  totalAmount: number;

  @Prop({ required: true, default: 0 })
  paidAmount: number;

  @Prop({ required: true })
  pendingAmount: number;

  @Prop({ type: String, enum: ['PENDING', 'PARTIAL', 'PAID'], default: 'PENDING' })
  status: string;

  @Prop({ type: [CreditPaymentSubdocSchema], default: [] })
  payments: CreditPaymentSubdoc[];

  @Prop({ type: Types.ObjectId, ref: 'UserDocument' })
  createdBy: Types.ObjectId;
}

export type CreditAccountDoc = CreditAccountDocument & Document;
export const CreditAccountSchema = SchemaFactory.createForClass(CreditAccountDocument);

CreditAccountSchema.index({ client: 1, status: 1 });
