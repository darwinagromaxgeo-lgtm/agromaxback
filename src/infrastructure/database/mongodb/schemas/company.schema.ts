import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ _id: false })
export class CompanyBankAccountSubdoc {
  @Prop({ required: true }) bank: string;
  @Prop({ required: true, enum: ['PEN', 'USD'] }) currency: string;
  @Prop({ required: true }) accountNumber: string;
  @Prop() cci?: string;
  @Prop({ required: true }) holder: string;
  @Prop({ required: true, default: true }) isActive: boolean;
}

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

  @Prop({ type: [SchemaFactory.createForClass(CompanyBankAccountSubdoc)], default: [] })
  bankAccounts: CompanyBankAccountSubdoc[];

  @Prop({ default: 0 }) bankAccountsRevision: number;

  @Prop({ default: true })
  isActive: boolean;
}

export type CompanyDoc = CompanyDocument & Document;
export const CompanySchema = SchemaFactory.createForClass(CompanyDocument);
