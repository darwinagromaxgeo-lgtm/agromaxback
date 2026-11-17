import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { applyBranchScope } from '../branch-scope.plugin';

@Schema({ _id: false })
export class LoanItemSubdoc {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ProductDocument', required: true })
  product: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'CompanyDocument', required: true })
  company: Types.ObjectId;

  @Prop({ required: true })
  quantity: number;

  @Prop({ required: true, default: 0 })
  returnedQuantity: number;
}

export const LoanItemSubdocSchema = SchemaFactory.createForClass(LoanItemSubdoc);

@Schema({ _id: false })
export class LoanReturnItemSubdoc {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ProductDocument', required: true })
  product: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'CompanyDocument', required: true })
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

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'UserDocument' })
  returnedBy: Types.ObjectId;

  @Prop({ required: true, default: Date.now })
  date: Date;
}

export const LoanReturnSubdocSchema = SchemaFactory.createForClass(LoanReturnSubdoc);

@Schema({ timestamps: true, collection: 'loans' })
export class LoanDocument {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'BranchDocument', required: true })
  branch: Types.ObjectId;

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

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'UserDocument' })
  createdBy: Types.ObjectId;
}

export type LoanDoc = LoanDocument & Document;
export const LoanSchema = SchemaFactory.createForClass(LoanDocument);
applyBranchScope(LoanSchema);

LoanSchema.index({ branch: 1, borrowerName: 1, status: 1 });
LoanSchema.index({ branch: 1, date: -1 });
