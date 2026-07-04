import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'clients' })
export class ClientDocument {
  @Prop({ required: true })
  name: string;

  @Prop({ unique: true, sparse: true })
  documentNumber: string;

  @Prop()
  phone: string;

  @Prop()
  email: string;

  @Prop()
  address: string;

  @Prop({ default: true })
  isActive: boolean;
}

export type ClientDoc = ClientDocument & Document;
export const ClientSchema = SchemaFactory.createForClass(ClientDocument);

ClientSchema.index({ name: 1 });
