import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: false })
export class LoanItemSubdoc {
  @Prop({ type: Types.ObjectId, ref: 'ProductDocument', required: true })
  product: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'CompanyDocument', required: true })
  company: Types.ObjectId;

  @Prop({ required: true })
  quantity: number;

  @Prop({ required: true, default: 0 })
  returnedQuantity: number;
}

export const LoanItemSubdocSchema = SchemaFactory.createForClass(LoanItemSubdoc);

@Schema({ _id: false })
export class LoanReturnItemSubdoc {
  @Prop({ type: Types.ObjectId, ref: 'ProductDocument', required: true })
  product: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'CompanyDocument', required: true })
  company: Types.ObjectId;

  @Prop({ required: true })
  quantity: number;
}

export const LoanReturnItemSubdocSchema = SchemaFactory.createForClass(LoanReturnItemSubdoc);

@Schema({ timestamps: true })
export class LoanReturnSubdoc {
  @Prop({ type: [LoanReturnItemSubdocSchema], required: true })
  items: LoanReturnItemSubdoc[];

  @Prop()
  notes: string;

  @Prop({ type: Types.ObjectId, ref: 'UserDocument' })
  returnedBy: Types.ObjectId;

  @Prop({ required: true, default: Date.now })
  date: Date;
}

export const LoanReturnSubdocSchema = SchemaFactory.createForClass(LoanReturnSubdoc);

@Schema({ timestamps: true, collection: 'loans' })
export class LoanDocument {
  @Prop({ required: true })
  borrowerName: string;

  @Prop({ type: [LoanItemSubdocSchema], required: true })
  items: LoanItemSubdoc[];

  @Prop({ type: String, enum: ['ACTIVE', 'PARTIAL', 'RETURNED'], default: 'ACTIVE' })
  status: string;

  @Prop({ type: [LoanReturnSubdocSchema], default: [] })
  returns: LoanReturnSubdoc[];

  @Prop()
  notes: string;

  @Prop({ required: true, default: Date.now })
  date: Date;

  @Prop({ type: Types.ObjectId, ref: 'UserDocument' })
  createdBy: Types.ObjectId;
}

export type LoanDoc = LoanDocument & Document;
export const LoanSchema = SchemaFactory.createForClass(LoanDocument);

LoanSchema.index({ borrowerName: 1, status: 1 });
LoanSchema.index({ date: -1 });
