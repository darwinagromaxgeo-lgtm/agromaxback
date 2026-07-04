import { IsString, IsArray, ValidateNested, IsNumber, IsOptional, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class QuoteItemDto {
  @IsString() productId: string;
  @IsString() companyId: string;
  @IsNumber() quantity: number;
  @IsString() priceTier: string;
  @IsNumber() unitPrice: number;
}

export class CreateQuoteDto {
  @IsOptional() @IsString() companyId?: string;
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() clientName?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => QuoteItemDto) items: QuoteItemDto[];
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsDateString() issueDate?: string;
  @IsOptional() @IsDateString() validUntil?: string;
  @IsOptional() @IsString() series?: string;
}
