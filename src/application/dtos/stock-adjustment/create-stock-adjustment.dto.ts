import { IsString, IsNumber, IsEnum, Min, IsOptional, IsDateString } from 'class-validator';
import { Transform } from 'class-transformer';
import { StockAdjustmentType } from '../../../domain/enums';

export class CreateStockAdjustmentDto {
  @IsString() productId: string;
  @IsString() companyId: string;
  @IsEnum(StockAdjustmentType) type: StockAdjustmentType;
  @IsNumber() @Min(0.01) quantity: number;
  @IsString() reason: string;
  @IsOptional() @Transform(({ value }) => value || undefined) @IsString() lotNumber?: string;
  @IsOptional() @Transform(({ value }) => value || undefined) @IsDateString() expirationDate?: string;
}
