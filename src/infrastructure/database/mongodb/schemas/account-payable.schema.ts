import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ _id: true, timestamps: false })
export class APInstallmentSubdoc {
  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  dueDate: Date;

  @Prop({ type: String, enum: ['PENDING', 'PAID'], default: 'PENDING' })
  status: string;

  @Prop()
  paidDate: Date;

  @Prop()
  paidAmountPen: number;
}

export const APInstallmentSubdocSchema = SchemaFactory.createForClass(APInstallmentSubdoc);

@Schema({ _id: true, timestamps: false })
export class APPaymentSubdoc {
  @Prop({ required: true })
  amount: number;

  @Prop({ required: true, default: Date.now })
  paymentDate: Date;

  @Prop()
  codigoTransferencia: string;

  @Prop()
  notes: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'UserDocument' })
  registeredBy: Types.ObjectId;

  @Prop()
  voucherUrl: string;
}

export const APPaymentSubdocSchema = SchemaFactory.createForClass(APPaymentSubdoc);

@Schema({ timestamps: true, collection: 'accounts_payable' })
export class AccountPayableDocument {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'PurchaseDocument', required: true })
  purchase: Types.ObjectId;

  @Prop({ required: true })
  supplier: string;

  @Prop({ required: true })
  totalAmount: number;

  @Prop({ required: true, default: 0 })
  paidAmount: number;

  @Prop({ required: true })
  pendingAmount: number;

  @Prop({ type: String, enum: ['PENDING', 'PARTIAL', 'PAID', 'CONSOLIDATED'], default: 'PENDING' })
  status: string;

  @Prop({ type: String })
  agreementId: string;

  @Prop({ type: String, enum: ['SINGLE_DATE', 'INSTALLMENTS', 'PENDIENTE_ACUERDO'], required: true })
  paymentScheduleType: string;

  @Prop({ type: Date })
  dueDate: Date;

  @Prop({ type: [APInstallmentSubdocSchema], default: [] })
  installments: APInstallmentSubdoc[];

  @Prop({ type: [APPaymentSubdocSchema], default: [] })
  payments: APPaymentSubdoc[];

  @Prop({ type: String, enum: ['PEN', 'USD'], default: 'PEN' })
  currency: string;

  @Prop()
  totalAmountPen: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'UserDocument' })
  createdBy: Types.ObjectId;
}

export type AccountPayableDoc = AccountPayableDocument & Document;
export const AccountPayableSchema = SchemaFactory.createForClass(AccountPayableDocument);

AccountPayableSchema.index({ purchase: 1 }, { unique: true });
AccountPayableSchema.index({ status: 1 });
AccountPayableSchema.index({ supplier: 1 });
AccountPayableSchema.index({ dueDate: 1 });
