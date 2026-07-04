import { IsString, IsOptional, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class EditItemDto {
  @IsString()
  productId: string;

  @IsOptional() @IsNumber()
  quantity?: number;

  @IsOptional() @IsNumber()
  unitCost?: number;

  @IsOptional() @IsNumber()
  unitPriceSinIgv?: number;

  @IsOptional() @IsNumber()
  unitPriceConIgv?: number;

  @IsOptional() @IsNumber()
  precioVenta?: number;

  @IsOptional() @IsNumber()
  precioMinorista?: number;

  @IsOptional() @IsNumber()
  precioEspecial?: number;

  @IsOptional() @IsNumber()
  markupPercent?: number;

  @IsOptional() @IsNumber()
  markupMinoristaPercent?: number;

  @IsOptional() @IsNumber()
  markupEspecialPercent?: number;

  @IsOptional() @IsNumber()
  minMarginPercent?: number;

  @IsOptional() @IsString()
  lotNumber?: string;

  @IsOptional() @IsString()
  expirationDate?: string | null;
}

class AddItemDto {
  @IsString()
  productId: string;

  @IsOptional() @IsString()
  productName?: string;

  @IsNumber()
  quantity: number;

  @IsOptional() @IsNumber()
  unitCost?: number;

  @IsOptional() @IsNumber()
  unitPriceSinIgv?: number;

  @IsOptional() @IsNumber()
  unitPriceConIgv?: number;

  @IsOptional() @IsNumber()
  precioVenta?: number;

  @IsOptional() @IsNumber()
  precioMinorista?: number;

  @IsOptional() @IsNumber()
  precioEspecial?: number;

  @IsOptional() @IsString()
  lotNumber?: string;

  @IsOptional() @IsString()
  expirationDate?: string;

  @IsOptional() @IsString()
  taxType?: string;

  @IsOptional() @IsNumber()
  flete?: number;

  @IsOptional() @IsNumber()
  otrosCostos?: number;

  @IsOptional() @IsNumber()
  markupPercent?: number;

  @IsOptional() @IsNumber()
  markupMinoristaPercent?: number;

  @IsOptional() @IsNumber()
  markupEspecialPercent?: number;

  @IsOptional() @IsNumber()
  minMarginPercent?: number;
}

export class EditPurchaseItemsDto {
  @IsString()
  companyId: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => EditItemDto)
  edits?: EditItemDto[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AddItemDto)
  additions?: AddItemDto[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AddItemDto)
  bonificationAdditions?: AddItemDto[];
}
