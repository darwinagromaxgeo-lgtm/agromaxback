import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'product_lots' })
export class ProductLotDocument {
  @Prop({ type: Types.ObjectId, ref: 'ProductDocument', required: true })
  product: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'CompanyDocument', required: true })
  company: Types.ObjectId;

  @Prop({ required: true })
  lotNumber: string;

  @Prop({ type: Date })
  expirationDate: Date;

  @Prop({ required: true, default: 0 })
  initialQuantity: number;

  @Prop({ required: true, default: 0 })
  currentQuantity: number;

  @Prop({ type: Types.ObjectId, ref: 'PurchaseDocument' })
  purchaseId: Types.ObjectId;

  @Prop({ default: Date.now })
  receivedAt: Date;

  @Prop({ default: true })
  isActive: boolean;
}

export type ProductLotDoc = ProductLotDocument & Document;
export const ProductLotSchema = SchemaFactory.createForClass(ProductLotDocument);

ProductLotSchema.index({ product: 1, company: 1, lotNumber: 1 }, { unique: true });
ProductLotSchema.index({ company: 1, expirationDate: 1 });
