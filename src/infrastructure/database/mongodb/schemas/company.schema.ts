import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'companies' })
export class CompanyDocument {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  ruc: string;

  @Prop()
  address: string;

  @Prop()
  phone: string;

  @Prop({ default: true })
  isActive: boolean;
}

export type CompanyDoc = CompanyDocument & Document;
export const CompanySchema = SchemaFactory.createForClass(CompanyDocument);
