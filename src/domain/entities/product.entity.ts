export interface ProductPrice {
  priceTierId: string;
  companyId?: string;
  price: number;
}

export interface ActiveIngredientItem {
  name: string;
  concentration?: string;
}

export interface ProductEntity {
  id?: string;
  name: string;
  description?: string;
  categoryId: string;
  unit: string;
  activeIngredient?: string;
  activeIngredients?: ActiveIngredientItem[];
  taxType?: string;
  prices: ProductPrice[];
  tracksLot?: boolean;
  isActive: boolean;
  minSalePrice?: number;
  minMarginPercent?: number;
  location?: string;
  locations?: string[];
  supplier?: string;
  control?: string;
  cultivo?: string;
  dosis?: string;
  imageUrl?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
