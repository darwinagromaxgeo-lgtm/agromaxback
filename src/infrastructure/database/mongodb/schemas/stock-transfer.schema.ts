import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ _id: false })
export class StockTransferItemSubdoc {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ProductDocument', required: true })
  product: Types.ObjectId;

  @Prop({ required: true })
  quantity: number;
}

export const StockTransferItemSubdocSchema = SchemaFactory.createForClass(StockTransferItemSubdoc);

@Schema({ timestamps: true, collection: 'stock-transfers' })
export class StockTransferDocument {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'CompanyDocument', required: true })
  fromCompany: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'CompanyDocument', required: true })
  toCompany: Types.ObjectId;

  @Prop({ type: [StockTransferItemSubdocSchema], required: true })
  items: StockTransferItemSubdoc[];

  @Prop()
  notes: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'UserDocument', required: true })
  transferredBy: Types.ObjectId;

  @Prop({ required: true, default: Date.now })
  date: Date;
}

export type StockTransferDoc = StockTransferDocument & Document;
export const StockTransferSchema = SchemaFactory.createForClass(StockTransferDocument);

StockTransferSchema.index({ fromCompany: 1, date: -1 });
StockTransferSchema.index({ toCompany: 1, date: -1 });
