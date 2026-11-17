import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { applyBranchScope } from '../branch-scope.plugin';

@Schema({ timestamps: true, collection: 'stock_movements' })
export class StockMovementDocument {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ProductDocument', required: true })
  product: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'CompanyDocument', required: true })
  company: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'BranchDocument', required: true })
  branch: Types.ObjectId;

  @Prop({
    type: String,
    enum: ['PURCHASE', 'PURCHASE_BONUS', 'SALE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_OUT', 'LOAN_RETURN'],
    required: true,
  })
  movementType: string;

  @Prop({ required: true })
  quantity: number;

  @Prop({ required: true })
  previousStock: number;

  @Prop({ required: true })
  newStock: number;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  referenceId: Types.ObjectId;

  @Prop()
  referenceType: string;

  @Prop({ required: true })
  description: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'UserDocument' })
  user: Types.ObjectId;

  @Prop({ required: true, default: Date.now })
  date: Date;
}

export type StockMovementDoc = StockMovementDocument & Document;
export const StockMovementSchema = SchemaFactory.createForClass(StockMovementDocument);
applyBranchScope(StockMovementSchema);

StockMovementSchema.index({ product: 1, company: 1, branch: 1, date: -1 });
StockMovementSchema.index({ branch: 1, company: 1, date: -1 });
StockMovementSchema.index({ product: 1, date: -1 });
StockMovementSchema.index({ movementType: 1, date: -1 });
