import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'categories' })
export class CategoryDocument {
  @Prop({ required: true })
  name: string;

  @Prop()
  description: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'CategoryDocument', default: null })
  parentId: Types.ObjectId | null;
}

export type CategoryDoc = CategoryDocument & Document;
export const CategorySchema = SchemaFactory.createForClass(CategoryDocument);
