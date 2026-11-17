import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { applyBranchScope } from '../branch-scope.plugin';

@Schema({ timestamps: true, collection: 'product_lots' })
export class ProductLotDocument {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ProductDocument', required: true })
  product: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'CompanyDocument', required: true })
  company: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'BranchDocument', required: true })
  branch: Types.ObjectId;

  @Prop({ required: true })
  lotNumber: string;

  @Prop({ type: Date })
  expirationDate: Date;

  @Prop({ required: true, default: 0 })
  initialQuantity: number;

  @Prop({ required: true, default: 0 })
  currentQuantity: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'PurchaseDocument' })
  purchaseId: Types.ObjectId;

  @Prop({ default: Date.now })
  receivedAt: Date;

  @Prop({ default: true })
  isActive: boolean;
}

export type ProductLotDoc = ProductLotDocument & Document;
export const ProductLotSchema = SchemaFactory.createForClass(ProductLotDocument);
applyBranchScope(ProductLotSchema);

ProductLotSchema.index({ product: 1, company: 1, branch: 1, lotNumber: 1 }, { unique: true });
ProductLotSchema.index({ branch: 1, company: 1, expirationDate: 1 });
