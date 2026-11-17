import { IsString, IsOptional, IsArray, ValidateNested, IsBoolean, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ProductPriceDto, ActiveIngredientItemDto } from './create-product.dto';
import { IgvTaxType } from '../../../domain/enums';

export class UpdateProductDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() activeIngredient?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ActiveIngredientItemDto) activeIngredients?: ActiveIngredientItemDto[];
  @IsOptional() @IsIn([...Object.values(IgvTaxType), 'PENDIENTE']) taxType?: IgvTaxType | 'PENDIENTE';
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ProductPriceDto) prices?: ProductPriceDto[];
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() tracksLot?: boolean;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) locations?: string[];
  @IsOptional() @IsString() supplier?: string;
  @IsOptional() @IsString() control?: string;
  @IsOptional() @IsString() cultivo?: string;
  @IsOptional() @IsString() dosis?: string;
  @IsOptional() @IsString() imageUrl?: string;
}
