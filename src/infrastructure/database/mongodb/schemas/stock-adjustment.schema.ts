import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { applyBranchScope } from '../branch-scope.plugin';

@Schema({ timestamps: true, collection: 'stock_adjustments' })
export class StockAdjustmentDocument {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ProductDocument', required: true })
  product: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'CompanyDocument', required: true })
  company: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'BranchDocument', required: true })
  branch: Types.ObjectId;

  @Prop({ type: String, enum: ['INCREASE', 'DECREASE'], required: true })
  type: string;

  @Prop({ type: String, enum: ['INCREASE', 'DECREASE', 'SET'] })
  mode?: string;

  @Prop({ type: String, enum: ['ENTRY', 'EXIT', 'WASTE', 'COUNT'] })
  movementKind?: string;

  @Prop() targetQuantity?: number;
  @Prop() requestId?: string;

  @Prop({ required: true })
  quantity: number;

  @Prop({ required: true })
  reason: string;

  @Prop({ required: true })
  previousQuantity: number;

  @Prop({ required: true })
  newQuantity: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'UserDocument' })
  adjustedBy: Types.ObjectId;

  @Prop({ required: true, default: Date.now })
  date: Date;
}

export type StockAdjustmentDoc = StockAdjustmentDocument & Document;
export const StockAdjustmentSchema = SchemaFactory.createForClass(StockAdjustmentDocument);
applyBranchScope(StockAdjustmentSchema);

StockAdjustmentSchema.index({ product: 1, company: 1, branch: 1 });
StockAdjustmentSchema.index({ branch: 1, company: 1, date: -1 });
