import { IsString, IsArray, ValidateNested, IsNumber, IsOptional, IsDateString, IsBoolean, ArrayMinSize, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class SaleItemDto {
  @IsString() productId: string;
  @IsString() companyId: string;
  @IsNumber() quantity: number;
  @IsString() priceTier: string;
  @IsNumber() unitPrice: number;
  @IsOptional() @IsString() lotId?: string;
}

export class SalePaymentDto {
  @IsString() paymentMethodId: string;
  @IsNumber() @Min(0.01) amount: number;
}

export class CreateSaleDto {
  @IsOptional() @IsString() companyId?: string;
  @IsOptional() @IsString() clientId?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => SaleItemDto) items: SaleItemDto[];
  @IsOptional() @IsString() voucherType?: string;
  @IsOptional() @IsBoolean() isCredit?: boolean;
  @IsOptional() @IsString() creditAccountId?: string;
  @IsOptional() @IsString() creditName?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SalePaymentDto) payments?: SalePaymentDto[];
  @IsOptional() @IsDateString() date?: string;
}
