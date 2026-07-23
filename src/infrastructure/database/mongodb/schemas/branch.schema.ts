import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'branches' })
export class BranchDocument {
  @Prop({ required: true, unique: true, trim: true, uppercase: true })
  code: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop()
  address?: string;

  @Prop()
  phone?: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'CompanyDocument' }], default: [] })
  companies: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'CompanyDocument' })
  defaultCompany?: Types.ObjectId;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isMain: boolean;
}

export type BranchDoc = BranchDocument & Document;
export const BranchSchema = SchemaFactory.createForClass(BranchDocument);

BranchSchema.index({ code: 1 }, { unique: true });
BranchSchema.index({ isActive: 1, name: 1 });
