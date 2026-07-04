import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'stock_adjustments' })
export class StockAdjustmentDocument {
  @Prop({ type: Types.ObjectId, ref: 'ProductDocument', required: true })
  product: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'CompanyDocument', required: true })
  company: Types.ObjectId;

  @Prop({ type: String, enum: ['INCREASE', 'DECREASE'], required: true })
  type: string;

  @Prop({ required: true })
  quantity: number;

  @Prop({ required: true })
  reason: string;

  @Prop({ required: true })
  previousQuantity: number;

  @Prop({ required: true })
  newQuantity: number;

  @Prop({ type: Types.ObjectId, ref: 'UserDocument' })
  adjustedBy: Types.ObjectId;

  @Prop({ required: true, default: Date.now })
  date: Date;
}

export type StockAdjustmentDoc = StockAdjustmentDocument & Document;
export const StockAdjustmentSchema = SchemaFactory.createForClass(StockAdjustmentDocument);

StockAdjustmentSchema.index({ product: 1, company: 1 });
StockAdjustmentSchema.index({ company: 1, date: -1 });
