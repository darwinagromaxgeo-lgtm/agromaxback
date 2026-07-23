import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: false })
export class ActiveIngredientSubdoc {
  @Prop({ required: true })
  name: string;

  @Prop()
  concentration?: string;
}

export const ActiveIngredientSubdocSchema = SchemaFactory.createForClass(ActiveIngredientSubdoc);

@Schema({ _id: false })
export class ProductPriceSubdoc {
  @Prop({ type: Types.ObjectId, ref: 'PriceTierDocument', required: true })
  priceTier: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'CompanyDocument' })
  company?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'BranchDocument' })
  branch?: Types.ObjectId;

  @Prop({ required: true })
  price: number;
}

export const ProductPriceSubdocSchema = SchemaFactory.createForClass(ProductPriceSubdoc);

@Schema({ timestamps: true, collection: 'products' })
export class ProductDocument {
  @Prop({ index: true, sparse: true })
  externalId?: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  description: string;

  @Prop({ type: Types.ObjectId, ref: 'CategoryDocument', required: true })
  category: Types.ObjectId;

  @Prop({ required: true })
  unit: string;

  @Prop()
  activeIngredient: string;

  @Prop({ type: [ActiveIngredientSubdocSchema], default: [] })
  activeIngredients: ActiveIngredientSubdoc[];

  @Prop({ type: [ProductPriceSubdocSchema], default: [] })
  prices: ProductPriceSubdoc[];

  @Prop({ default: 'GRAVADO' })
  taxType: string;

  @Prop({ default: false })
  tracksLot: boolean;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  minSalePrice?: number;

  @Prop({ default: 5 })
  minMarginPercent?: number;

  @Prop()
  location?: string;

  @Prop({ type: [String], default: [] })
  locations?: string[];

  @Prop()
  supplier?: string;

  @Prop()
  control?: string;

  @Prop()
  cultivo?: string;

  @Prop()
  dosis?: string;

  @Prop()
  imageUrl?: string;
}

export type ProductDoc = ProductDocument & Document;
export const ProductSchema = SchemaFactory.createForClass(ProductDocument);

ProductSchema.index({ name: 1 });
ProductSchema.index({ category: 1 });
ProductSchema.index({ isActive: 1 });
ProductSchema.index({ activeIngredient: 1 });
