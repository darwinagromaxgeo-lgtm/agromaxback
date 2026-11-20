import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { applyBranchScope } from '../branch-scope.plugin';

@Schema({ _id: false })
export class EditHistorySubdoc {
  @Prop({ required: true })
  previousAmount: number;

  @Prop({ required: true })
  newAmount: number;

  @Prop({ required: true })
  reason: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'UserDocument' })
  editedBy: Types.ObjectId;

  @Prop({ default: Date.now })
  editedAt: Date;

  @Prop() previousPaymentMethodName?: string;
  @Prop() newPaymentMethodName?: string;
}

export const EditHistorySubdocSchema = SchemaFactory.createForClass(EditHistorySubdoc);

@Schema({ timestamps: true })
export class CashRegisterEntrySubdoc {
  @Prop({ type: String, enum: ['INCOME', 'EXPENSE'], required: true })
  type: string;

  @Prop({ type: String, enum: ['SALE', 'CREDIT_PAYMENT', 'PURCHASE', 'ADJUSTMENT', 'OTHER', 'OPERATING_EXPENSE', 'WITHDRAWAL', 'CAPITAL_CONTRIBUTION'], required: true })
  category: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'PaymentMethodDocument' })
  paymentMethodId?: Types.ObjectId;

  @Prop() paymentMethodName?: string;
  @Prop() paymentGroupId?: string;
  @Prop() paymentGroupTotal?: number;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  referenceId: Types.ObjectId;

  @Prop()
  referenceType: string;

  @Prop({ type: String, enum: ['NONE', 'BOLETA', 'FACTURA'], default: 'NONE' })
  voucherType: string;

  @Prop()
  voucherSeries: string;

  @Prop()
  voucherNumber: string;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'UserDocument' })
  deletedBy: Types.ObjectId;

  @Prop()
  deletedAt: Date;

  @Prop()
  deleteReason: string;

  @Prop({ type: [EditHistorySubdocSchema], default: [] })
  editHistory: EditHistorySubdoc[];

  @Prop({
    type: {
      serie: { type: String },
      correlativo: { type: String },
      fecha: { type: Date },
    },
  })
  remisionGuia?: { serie: string; correlativo: string; fecha: Date };

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'UserDocument' })
  createdBy: Types.ObjectId;
}

export const CashRegisterEntrySubdocSchema = SchemaFactory.createForClass(CashRegisterEntrySubdoc);

@Schema({ timestamps: true, collection: 'cash_registers' })
export class CashRegisterDocument {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'BranchDocument', required: true })
  branch: Types.ObjectId;

  @Prop({ required: true })
  date: string;

  @Prop({ required: true, default: 0 })
  openingBalance: number;

  @Prop({
    type: [
      {
        previousAmount: { type: Number, required: true },
        newAmount: { type: Number, required: true },
        reason: { type: String, required: true },
        adjustedBy: { type: MongooseSchema.Types.ObjectId, ref: 'UserDocument' },
        adjustedAt: { type: Date, required: true },
      },
    ],
    default: [],
  })
  openingBalanceHistory: {
    previousAmount: number;
    newAmount: number;
    reason: string;
    adjustedBy?: Types.ObjectId;
    adjustedAt: Date;
  }[];

  @Prop({ type: String, enum: ['OPEN', 'CLOSED'], default: 'OPEN' })
  status: string;

  @Prop({ type: [CashRegisterEntrySubdocSchema], default: [] })
  entries: CashRegisterEntrySubdoc[];

  @Prop()
  closingBalance: number;

  @Prop({ type: MongooseSchema.Types.Mixed })
  cashCount?: { expectedAmount: number; countedAmount: number; difference: number; methods: any[] };

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'UserDocument' })
  closedBy: Types.ObjectId;

  @Prop()
  closedAt: Date;

  @Prop()
  notes: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'UserDocument' })
  createdBy: Types.ObjectId;
}

export type CashRegisterDoc = CashRegisterDocument & Document;
export const CashRegisterSchema = SchemaFactory.createForClass(CashRegisterDocument);
applyBranchScope(CashRegisterSchema);

CashRegisterSchema.index({ branch: 1, date: 1 }, { unique: true });
CashRegisterSchema.index({ branch: 1, status: 1 });
