import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'price-tiers' })
export class PriceTierDocument {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop()
  description: string;

  @Prop({ required: true, default: 0 })
  priority: number;

  @Prop({ default: true })
  isActive: boolean;
}

export type PriceTierDoc = PriceTierDocument & Document;
export const PriceTierSchema = SchemaFactory.createForClass(PriceTierDocument);
