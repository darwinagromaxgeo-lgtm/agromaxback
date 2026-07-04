import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'users' })
export class UserDocument {
  @Prop({ required: true, unique: true })
  username: string;

  @Prop({ unique: true, sparse: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({ required: true })
  fullName: string;

  @Prop({ required: true, default: 'VENDEDOR' })
  role: string;

  @Prop({ default: true })
  isActive: boolean;
}

export type UserDoc = UserDocument & Document;
export const UserSchema = SchemaFactory.createForClass(UserDocument);
