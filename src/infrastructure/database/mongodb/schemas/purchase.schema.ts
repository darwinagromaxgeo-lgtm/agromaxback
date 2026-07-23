import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { applyBranchScope } from '../branch-scope.plugin';

@Schema({ _id: false })
export class PurchaseItemSubdoc {
  @Prop({ type: Types.ObjectId, ref: 'ProductDocument', required: true })
  product: Types.ObjectId;

  @Prop({ required: true })
  quantity: number;

  @Prop({ default: 0 })
  receivedQty: number;

  @Prop()
  unitCost: number;

  @Prop()
  unitPriceSinIgv: number;

  @Prop()
  unitPriceConIgv: number;

  @Prop()
  flete: number;

  @Prop()
  otrosCostos: number;

  @Prop()
  precioVenta: number;

  @Prop()
  precioMinorista: number;

  @Prop()
  precioEspecial: number;

  @Prop({ default: 20 })
  markupPercent: number;

  @Prop({ default: 15 })
  markupMinoristaPercent: number;

  @Prop({ default: 10 })
  markupEspecialPercent: number;

  @Prop({ default: 5 })
  minMarginPercent: number;

  @Prop()
  lotNumber: string;

  @Prop({ type: Date })
  expirationDate: Date;

  @Prop({ type: String })
  taxType: string;
}

export const PurchaseItemSubdocSchema = SchemaFactory.createForClass(PurchaseItemSubdoc);

@Schema({ _id: false })
export class ReceptionItemSubdoc {
  @Prop({ type: Types.ObjectId, ref: 'ProductDocument', required: true })
  product: Types.ObjectId;

  @Prop({ required: true })
  quantity: number;
}

export const ReceptionItemSubdocSchema = SchemaFactory.createForClass(ReceptionItemSubdoc);

@Schema({ timestamps: true })
export class ReceptionSubdoc {
  @Prop({ required: true, default: Date.now })
  date: Date;

  @Prop({ type: Types.ObjectId, ref: 'UserDocument' })
  receivedBy: Types.ObjectId;

  @Prop()
  notes: string;

  @Prop({ type: [ReceptionItemSubdocSchema], default: [] })
  items: ReceptionItemSubdoc[];
}

export const ReceptionSubdocSchema = SchemaFactory.createForClass(ReceptionSubdoc);

@Schema({ timestamps: true, collection: 'purchases' })
export class PurchaseDocument {
  @Prop({ type: Types.ObjectId, ref: 'BranchDocument', required: true })
  branch: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'CompanyDocument', required: true })
  company: Types.ObjectId;

  @Prop({ required: true })
  supplier: string;

  @Prop({ type: [PurchaseItemSubdocSchema], required: true })
  items: PurchaseItemSubdoc[];

  @Prop({ type: [PurchaseItemSubdocSchema], default: [] })
  bonificationItems: PurchaseItemSubdoc[];

  @Prop({ required: true })
  totalCost: number;

  @Prop({ required: true, default: Date.now })
  date: Date;

  @Prop({ type: String, enum: ['PENDING', 'PARTIAL', 'RECEIVED'], default: 'PENDING' })
  receptionStatus: string;

  @Prop({ type: [ReceptionSubdocSchema], default: [] })
  receptions: ReceptionSubdoc[];

  @Prop({ type: String, enum: ['CONTADO', 'CREDITO', 'PENDIENTE_ACUERDO'], default: 'CONTADO' })
  paymentType: string;

  @Prop({ type: String, enum: ['SINGLE_DATE', 'INSTALLMENTS'] })
  paymentScheduleType: string;

  @Prop({ type: Date })
  dueDate: Date;

  @Prop({ type: Types.ObjectId, ref: 'SupplierDocument' })
  supplierId: Types.ObjectId;

  @Prop()
  supplierRuc: string;

  @Prop()
  totalCostUsd: number;

  @Prop()
  exchangeRate: number;

  @Prop({ type: String, enum: ['FACTURA', 'BOLETA', 'GUIA', 'NOTA_CREDITO', 'OTRO'] })
  documentType: string;

  @Prop()
  documentSeries: string;

  @Prop()
  documentNumber: string;

  @Prop({ type: Date })
  issueDate: Date;

  @Prop({
    type: {
      serie: { type: String },
      correlativo: { type: String },
      fecha: { type: Date },
    },
  })
  remisionGuia?: { serie: string; correlativo: string; fecha: Date };

  @Prop({ default: false })
  isHistorical: boolean;

  @Prop({ type: Types.ObjectId, ref: 'UserDocument' })
  createdBy: Types.ObjectId;
}

export type PurchaseDoc = PurchaseDocument & Document;
export const PurchaseSchema = SchemaFactory.createForClass(PurchaseDocument);
applyBranchScope(PurchaseSchema);

PurchaseSchema.index({ branch: 1, company: 1, date: -1 });
PurchaseSchema.index({ 'items.product': 1 });
PurchaseSchema.index(
  { branch: 1, company: 1, supplierId: 1, documentType: 1, documentSeries: 1, documentNumber: 1 },
  { unique: true, partialFilterExpression: { documentNumber: { $exists: true, $type: 'string' } } },
);
