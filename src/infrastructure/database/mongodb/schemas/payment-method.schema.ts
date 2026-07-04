import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'payment_methods' })
export class PaymentMethodDocument {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ default: true })
  isActive: boolean;
}

export type PaymentMethodDoc = PaymentMethodDocument & Document;
export const PaymentMethodSchema = SchemaFactory.createForClass(PaymentMethodDocument);

PaymentMethodSchema.index({ name: 1 }, { unique: true });
