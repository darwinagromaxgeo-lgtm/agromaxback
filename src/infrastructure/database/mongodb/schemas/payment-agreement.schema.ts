import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ _id: false })
export class AgreementRemisionGuiaSubdoc {
  @Prop({ required: true }) serie: string;
  @Prop({ required: true }) correlativo: string;
  @Prop({ required: true }) fecha: string;
}

@Schema({ _id: false })
export class AgreementInvoiceSubdoc {
  @Prop({ required: true }) apId: string;
  @Prop() purchaseId: string;
  @Prop() purchaseRef: string;
  @Prop({ required: true }) amount: number;
}

@Schema({ _id: true, timestamps: false })
export class AgreementInstallmentSubdoc {
  @Prop({ required: true }) amount: number;
  @Prop({ required: true }) dueDate: Date;
  @Prop({ type: String, enum: ['PENDING', 'PAID'], default: 'PENDING' }) status: string;
  @Prop() paidDate: Date;
  @Prop() voucherUrl: string;
}

@Schema({ _id: true, timestamps: false })
export class AgreementPaymentSubdoc {
  @Prop({ required: true }) amount: number;
  @Prop({ required: true, default: Date.now }) paymentDate: Date;
  @Prop({ required: true }) codigoTransferencia: string;
  @Prop() notes: string;
  @Prop() voucherUrl: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'UserDocument' }) registeredBy: Types.ObjectId;
}

@Schema({ timestamps: true, collection: 'payment_agreements' })
export class PaymentAgreementDocument {
  @Prop({ required: true }) supplier: string;
  @Prop({ type: [AgreementInvoiceSubdoc], default: [] }) invoices: AgreementInvoiceSubdoc[];
  @Prop({ required: true }) totalAmount: number;
  @Prop({ required: true, default: 0 }) paidAmount: number;
  @Prop({ required: true }) pendingAmount: number;
  @Prop({ type: String, enum: ['PENDING', 'PARTIAL', 'PAID', 'CANCELLED'], default: 'PENDING' }) status: string;
  @Prop({ type: String, enum: ['SINGLE_DATE', 'INSTALLMENTS'], required: true }) paymentScheduleType: string;
  @Prop({ type: String, enum: ['PEN', 'USD'], default: 'PEN' }) currency: string;
  @Prop({ type: Date }) dueDate: Date;
  @Prop({ type: [AgreementInstallmentSubdoc], default: [] }) installments: AgreementInstallmentSubdoc[];
  @Prop({ type: [AgreementPaymentSubdoc], default: [] }) payments: AgreementPaymentSubdoc[];
  @Prop({ type: String, enum: ['FACTURA', 'BOLETA'] }) documentType: string;
  @Prop() documentSeries: string;
  @Prop() documentNumber: string;
  @Prop({ type: AgreementRemisionGuiaSubdoc }) remisionGuia: AgreementRemisionGuiaSubdoc;
  @Prop() notes: string;
  @Prop() cancellationReason: string;
  @Prop() cancelledBy: string;
  @Prop({ type: Date }) cancelledAt: Date;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'UserDocument' }) createdBy: Types.ObjectId;
}

export type PaymentAgreementDoc = PaymentAgreementDocument & Document;
export const PaymentAgreementSchema = SchemaFactory.createForClass(PaymentAgreementDocument);
PaymentAgreementSchema.index({ supplier: 1 });
PaymentAgreementSchema.index({ status: 1 });
