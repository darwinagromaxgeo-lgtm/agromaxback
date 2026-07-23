import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { applyBranchScope } from '../branch-scope.plugin';

@Schema({ timestamps: true, collection: 'stocks' })
export class StockDocument {
  @Prop({ type: Types.ObjectId, ref: 'ProductDocument', required: true })
  product: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'CompanyDocument', required: true })
  company: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'BranchDocument', required: true })
  branch: Types.ObjectId;

  @Prop({ required: true, default: 0 })
  quantity: number;

  @Prop({ default: Date.now })
  lastUpdated: Date;
}

export type StockDoc = StockDocument & Document;
export const StockSchema = SchemaFactory.createForClass(StockDocument);
applyBranchScope(StockSchema);

StockSchema.index({ product: 1, company: 1, branch: 1 }, { unique: true });
StockSchema.index({ branch: 1, company: 1 });
