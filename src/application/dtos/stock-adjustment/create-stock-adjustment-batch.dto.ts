import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsMongoId, IsNotEmpty, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { StockAdjustmentItemDto } from './create-stock-adjustment.dto';

export class CreateStockAdjustmentBatchDto {
  @IsMongoId() companyId: string;
  @IsUUID('4') requestId: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(1000)
  @ArrayUnique((item: StockAdjustmentItemDto) => String(item?.productId).toLowerCase())
  @ValidateNested({ each: true }) @Type(() => StockAdjustmentItemDto)
  items: StockAdjustmentItemDto[];
}
