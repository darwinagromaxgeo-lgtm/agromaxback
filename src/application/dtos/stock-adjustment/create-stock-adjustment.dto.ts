import { IsString, IsNumber, IsEnum, IsIn, Min, Max, IsOptional, IsDateString, IsMongoId, IsUUID, MaxLength, IsNotEmpty, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { StockAdjustmentType } from '../../../domain/enums';
import { StockAdjustmentMovementKind } from '../../../domain/entities/stock-adjustment.entity';

export class StockAdjustmentItemDto {
  @IsMongoId() productId: string;
  @IsEnum(StockAdjustmentType) type: StockAdjustmentType;
  @IsOptional() @IsIn(['ENTRY', 'EXIT', 'WASTE', 'COUNT']) movementKind?: StockAdjustmentMovementKind;
  @IsNumber({ maxDecimalPlaces: 6 }) @Min(0) @Max(1e12) quantity: number;
  @ValidateIf((item: StockAdjustmentItemDto) => item.type === StockAdjustmentType.SET || item.expectedQuantity !== undefined)
  @IsNumber({ maxDecimalPlaces: 6 }) @Min(0) @Max(1e12) expectedQuantity?: number;
  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim() || undefined : value)
  @IsString() @MaxLength(100) lotNumber?: string;
  @IsOptional() @Transform(({ value }) => value || undefined) @IsDateString() expirationDate?: string;
}

export class CreateStockAdjustmentDto extends StockAdjustmentItemDto {
  @IsMongoId() companyId: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
  @IsOptional() @IsUUID('4') requestId?: string;
}
