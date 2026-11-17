import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ _id: false })
export class StockRequestLotAllocationSubdoc {
  @Prop({ required: true })
  lotNumber: string;

  @Prop()
  expirationDate?: Date;

  @Prop({ required: true, min: 0 })
  quantity: number;
}

export const StockRequestLotAllocationSubdocSchema =
  SchemaFactory.createForClass(StockRequestLotAllocationSubdoc);

@Schema({ _id: false })
export class StockRequestItemSubdoc {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ProductDocument', required: true })
  product: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  requestedQuantity: number;

  @Prop({ min: 0 })
  approvedQuantity?: number;

  @Prop({ type: [StockRequestLotAllocationSubdocSchema], default: [] })
  lotAllocations: StockRequestLotAllocationSubdoc[];
}

export const StockRequestItemSubdocSchema = SchemaFactory.createForClass(StockRequestItemSubdoc);

@Schema({ timestamps: true, collection: 'stock-requests' })
export class StockRequestDocument {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'BranchDocument', required: true })
  requestingBranch: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'BranchDocument', required: true })
  sourceBranch: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'CompanyDocument', required: true })
  company: Types.ObjectId;

  @Prop({ type: [StockRequestItemSubdocSchema], required: true })
  items: StockRequestItemSubdoc[];

  @Prop({
    required: true,
    enum: [
      'PENDING',
      'APPROVED',
      'REJECTED',
      'DISPATCHING',
      'IN_TRANSIT',
      'RECEIVING',
      'RECEIVED',
      'CANCELLED',
    ],
    default: 'PENDING',
  })
  status: string;

  @Prop()
  notes?: string;

  @Prop()
  rejectionReason?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'UserDocument', required: true })
  requestedBy: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'UserDocument' })
  reviewedBy?: Types.ObjectId;

  @Prop()
  reviewedAt?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'UserDocument' })
  dispatchedBy?: Types.ObjectId;

  @Prop()
  dispatchedAt?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'UserDocument' })
  receivedBy?: Types.ObjectId;

  @Prop()
  receivedAt?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'UserDocument' })
  cancelledBy?: Types.ObjectId;

  @Prop()
  cancelledAt?: Date;
}

export type StockRequestDoc = StockRequestDocument & Document;
export const StockRequestSchema = SchemaFactory.createForClass(StockRequestDocument);

StockRequestSchema.index({ sourceBranch: 1, status: 1, createdAt: -1 });
StockRequestSchema.index({ requestingBranch: 1, status: 1, createdAt: -1 });
