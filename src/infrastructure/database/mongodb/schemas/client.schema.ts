import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { applyBranchScope } from '../branch-scope.plugin';

@Schema({ timestamps: true, collection: 'clients' })
export class ClientDocument {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'BranchDocument', required: true })
  branch: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ trim: true })
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
applyBranchScope(ClientSchema);

ClientSchema.index({ branch: 1, name: 1 });
ClientSchema.index(
  { branch: 1, documentNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { documentNumber: { $type: 'string', $gt: '' } },
  },
);
