import { IsString, IsOptional, IsArray, ValidateNested, IsNumber, Min, IsEnum, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { IgvTaxType } from '../../../domain/enums';

export class ActiveIngredientItemDto {
  @IsString() name: string;
  @IsOptional() @IsString() concentration?: string;
}

export class ProductPriceDto {
  @IsString()
  priceTierId: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsNumber()
  price: number;
}

export class InitialStockDto {
  @IsString()
  companyId: string;

  @IsNumber()
  @Min(0)
  quantity: number;
}

export class CreateProductDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  categoryId: string;

  @IsString()
  unit: string;

  @IsOptional()
  @IsString()
  activeIngredient?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActiveIngredientItemDto)
  activeIngredients?: ActiveIngredientItemDto[];

  @IsOptional()
  @IsEnum(IgvTaxType)
  taxType?: IgvTaxType;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductPriceDto)
  prices?: ProductPriceDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InitialStockDto)
  initialStocks?: InitialStockDto[];

  @IsOptional()
  @IsBoolean()
  tracksLot?: boolean;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  locations?: string[];

  @IsOptional() @IsString() supplier?: string;
  @IsOptional() @IsString() control?: string;
  @IsOptional() @IsString() cultivo?: string;
  @IsOptional() @IsString() dosis?: string;
}
