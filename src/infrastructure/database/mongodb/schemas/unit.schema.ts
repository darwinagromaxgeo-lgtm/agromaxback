import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'units' })
export class UnitDocument {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop()
  abbreviation: string;

  @Prop({ default: true })
  isActive: boolean;
}

export type UnitDoc = UnitDocument & Document;
export const UnitSchema = SchemaFactory.createForClass(UnitDocument);
