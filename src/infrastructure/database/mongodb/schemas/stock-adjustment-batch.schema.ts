import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types } from 'mongoose';
import { StockAdjustmentBatchResult } from '../../../../domain/entities/stock-adjustment-batch.entity';
import { applyBranchScope } from '../branch-scope.plugin';

@Schema({ timestamps: true, collection: 'stock_adjustment_batches' })
export class StockAdjustmentBatchDocument {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true }) branch: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true }) company: Types.ObjectId;
  @Prop({ required: true }) requestId: string;
  @Prop({ required: true }) payloadHash: string;
  @Prop({ type: MongooseSchema.Types.Mixed, required: true }) result: StockAdjustmentBatchResult;
}

export const StockAdjustmentBatchSchema = SchemaFactory.createForClass(StockAdjustmentBatchDocument);
applyBranchScope(StockAdjustmentBatchSchema);
StockAdjustmentBatchSchema.index({ branch: 1, company: 1, requestId: 1 }, { unique: true });
