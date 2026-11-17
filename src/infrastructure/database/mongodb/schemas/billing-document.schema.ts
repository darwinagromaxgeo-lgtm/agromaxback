import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongoSchema, Types } from 'mongoose';
import { applyBranchScope } from '../branch-scope.plugin';
import { BillingItemSnapshot, BillingPartySnapshot } from '../../../../domain/entities/billing-document.entity';

@Schema({ timestamps: true, collection: 'billing_documents' })
export class BillingDocument {
  @Prop({ type: MongoSchema.Types.ObjectId, ref: 'BranchDocument', required: true })
  branch: Types.ObjectId;

  @Prop({ type: MongoSchema.Types.ObjectId, ref: 'CompanyDocument', required: true })
  company: Types.ObjectId;

  @Prop({ type: MongoSchema.Types.ObjectId, ref: 'SaleDocument', required: true })
  sale: Types.ObjectId;

  @Prop({ required: true, enum: ['FACTURA', 'BOLETA'] })
  documentType: string;

  @Prop({ required: true, enum: ['GRAVADO', 'EXONERADO', 'INAFECTO'] })
  taxType: string;

  @Prop({ required: true, enum: ['DRAFT', 'SENDING', 'PENDING', 'ACCEPTED', 'REJECTED', 'UNKNOWN', 'DISCARDED'], default: 'DRAFT' })
  status: string;

  @Prop({ required: true, default: true })
  activeSlot: boolean;

  @Prop({ required: true, enum: ['PEN'], default: 'PEN' })
  currency: string;

  @Prop({ type: MongoSchema.Types.Mixed, required: true })
  issuer: BillingPartySnapshot;

  @Prop({ type: MongoSchema.Types.Mixed, required: true })
  receiver: BillingPartySnapshot;

  @Prop({ default: 0, min: 0 })
  receiverRevision: number;

  @Prop({ type: MongoSchema.Types.ObjectId, ref: 'UserDocument' })
  receiverUpdatedBy?: Types.ObjectId;

  @Prop()
  receiverUpdatedAt?: Date;

  @Prop({ type: [MongoSchema.Types.Mixed], required: true })
  items: BillingItemSnapshot[];

  @Prop({ required: true, min: 0 })
  taxableAmount: number;

  @Prop({ required: true, min: 0 })
  exemptAmount: number;

  @Prop({ required: true, min: 0 })
  unaffectedAmount: number;

  @Prop({ required: true, min: 0 })
  taxAmount: number;

  @Prop({ required: true, min: 0 })
  total: number;

  @Prop({ required: true, enum: ['CONTADO', 'CREDITO'] })
  paymentCondition: string;

  @Prop({ required: true })
  saleDate: Date;

  @Prop({ type: [String], default: [] })
  warnings: string[];

  @Prop({ required: true, default: false })
  legacyTaxData: boolean;

  @Prop({ type: MongoSchema.Types.ObjectId, ref: 'UserDocument' })
  createdBy: Types.ObjectId;

  @Prop({ type: MongoSchema.Types.ObjectId, ref: 'UserDocument' })
  discardedBy: Types.ObjectId;

  @Prop()
  discardedAt: Date;

  @Prop()
  discardReason: string;

  @Prop()
  series: string;

  @Prop()
  number: number;

  @Prop({ enum: ['beta', 'production'] })
  environment: string;

  @Prop()
  submittedAt: Date;

  @Prop({ type: MongoSchema.Types.ObjectId, ref: 'UserDocument' })
  submittedBy: Types.ObjectId;

  @Prop()
  sunatCode: string;

  @Prop()
  sunatDescription: string;

  @Prop()
  hash: string;

  @Prop()
  ticket: string;

  @Prop()
  summaryNumber: number;

  @Prop()
  summaryDate: string;

  @Prop({ type: String, enum: ['individual', 'summary'] })
  boletaSubmissionMode?: 'individual' | 'summary';

  @Prop({ default: false })
  hasPdf: boolean;

  @Prop({ default: false })
  hasXml: boolean;

  @Prop({ default: false })
  hasCdr: boolean;

  @Prop({ select: false })
  pdfBase64: string;

  @Prop({ select: false })
  xmlBase64: string;

  @Prop({ select: false })
  cdrBase64: string;
}

export type BillingDocumentDoc = BillingDocument & Document;
export const BillingDocumentSchema = SchemaFactory.createForClass(BillingDocument);
applyBranchScope(BillingDocumentSchema);
BillingDocumentSchema.index({ branch: 1, company: 1, createdAt: -1 });
// A submitted document still occupies the sale/issuer slot. It cannot be issued twice.
BillingDocumentSchema.index(
  { branch: 1, sale: 1, company: 1, taxType: 1 },
  { unique: true, partialFilterExpression: { activeSlot: true }, name: 'unique_billing_document_per_sale_issuer' },
);

@Schema({ collection: 'billing_counters' })
export class BillingCounter {
  @Prop({ required: true }) issuerRuc: string;
  @Prop({ required: true }) series: string;
  @Prop({ required: true }) environment: string;
  @Prop({ required: true }) sequence: number;
}
export type BillingCounterDoc = BillingCounter & Document;
export const BillingCounterSchema = SchemaFactory.createForClass(BillingCounter);
// Fiscal numbering belongs to the RUC/series, across all branches of that issuer.
BillingCounterSchema.index({ issuerRuc: 1, series: 1, environment: 1 }, { unique: true });
