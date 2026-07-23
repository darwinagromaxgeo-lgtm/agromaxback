import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { applyBranchScope } from '../branch-scope.plugin';

@Schema({ _id: false })
export class QuoteItemSubdoc {
  @Prop({ type: Types.ObjectId, ref: 'ProductDocument', required: true })
  product: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'CompanyDocument', required: true })
  company: Types.ObjectId;

  @Prop({ required: true })
  quantity: number;

  @Prop({ required: true })
  priceTier: string;

  @Prop({ required: true })
  unitPrice: number;

  @Prop({ required: true })
  subtotal: number;
}

export const QuoteItemSubdocSchema = SchemaFactory.createForClass(QuoteItemSubdoc);

@Schema({ timestamps: true, collection: 'quotes' })
export class QuoteDocument {
  @Prop({ type: Types.ObjectId, ref: 'BranchDocument', required: true })
  branch: Types.ObjectId;

  @Prop({ required: true })
  series: string;

  @Prop({ required: true })
  number: number;

  @Prop({ required: true })
  quoteNumber: string;

  @Prop({ type: Types.ObjectId, ref: 'CompanyDocument' })
  company: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ClientDocument' })
  client: Types.ObjectId;

  @Prop()
  clientName: string;

  @Prop({ type: [QuoteItemSubdocSchema], required: true })
  items: QuoteItemSubdoc[];

  @Prop({ required: true })
  total: number;

  @Prop()
  notes: string;

  @Prop({ type: String, enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED'], default: 'PENDING' })
  status: string;

  @Prop({ required: true })
  issueDate: Date;

  @Prop({ required: true })
  validUntil: Date;

  @Prop({ type: Types.ObjectId, ref: 'SaleDocument' })
  convertedSaleId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'UserDocument' })
  createdBy: Types.ObjectId;
}

export type QuoteDoc = QuoteDocument & Document;
export const QuoteSchema = SchemaFactory.createForClass(QuoteDocument);
applyBranchScope(QuoteSchema);

QuoteSchema.index({ branch: 1, series: 1, number: 1 }, { unique: true });
QuoteSchema.index({ branch: 1, quoteNumber: 1 }, { unique: true });
QuoteSchema.index({ status: 1, validUntil: 1 });
QuoteSchema.index({ issueDate: -1 });

@Schema({ collection: 'quote_counters' })
export class QuoteCounterDocument {
  @Prop({ type: Types.ObjectId, ref: 'BranchDocument', required: true })
  branch: Types.ObjectId;

  @Prop({ required: true })
  series: string;

  @Prop({ required: true, default: 0 })
  seq: number;
}

export type QuoteCounterDoc = QuoteCounterDocument & Document;
export const QuoteCounterSchema = SchemaFactory.createForClass(QuoteCounterDocument);
applyBranchScope(QuoteCounterSchema);
QuoteCounterSchema.index({ branch: 1, series: 1 }, { unique: true });
