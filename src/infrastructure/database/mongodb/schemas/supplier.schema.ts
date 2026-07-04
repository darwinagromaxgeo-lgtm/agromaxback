import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'suppliers' })
export class SupplierDocument {
  @Prop({ required: true, unique: true })
  ruc: string;

  @Prop({ required: true })
  businessName: string;

  @Prop()
  address: string;

  @Prop()
  phone: string;

  @Prop({ default: true })
  isActive: boolean;
}

export type SupplierDoc = SupplierDocument & Document;
export const SupplierSchema = SchemaFactory.createForClass(SupplierDocument);

SupplierSchema.index({ businessName: 1 });
