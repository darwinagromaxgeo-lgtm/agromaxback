import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ _id: false })
export class UserBranchAssignmentSubdoc {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'BranchDocument', required: true })
  branch: Types.ObjectId;

  @Prop({ required: true })
  role: string;
}

export const UserBranchAssignmentSchema = SchemaFactory.createForClass(UserBranchAssignmentSubdoc);

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

  @Prop({ type: [UserBranchAssignmentSchema], default: [] })
  branchAssignments: UserBranchAssignmentSubdoc[];

  @Prop({ default: false })
  canTransferStock: boolean;

  @Prop({ default: true })
  isActive: boolean;
}

export type UserDoc = UserDocument & Document;
export const UserSchema = SchemaFactory.createForClass(UserDocument);
