import {
  ArrayMinSize,
  IsArray,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateStockRequestItemDto {
  @IsMongoId()
  productId: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity: number;
}

export class CreateStockRequestDto {
  @IsMongoId()
  sourceBranchId: string;

  @IsMongoId()
  companyId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateStockRequestItemDto)
  items: CreateStockRequestItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
