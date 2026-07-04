import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'stocks' })
export class StockDocument {
  @Prop({ type: Types.ObjectId, ref: 'ProductDocument', required: true })
  product: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'CompanyDocument', required: true })
  company: Types.ObjectId;

  @Prop({ required: true, default: 0 })
  quantity: number;

  @Prop({ default: Date.now })
  lastUpdated: Date;
}

export type StockDoc = StockDocument & Document;
export const StockSchema = SchemaFactory.createForClass(StockDocument);

StockSchema.index({ product: 1, company: 1 }, { unique: true });
