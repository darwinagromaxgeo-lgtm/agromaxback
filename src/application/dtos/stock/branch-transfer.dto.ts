import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsMongoId, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';

class BranchTransferItemDto {
  @IsMongoId() productId: string;
  @Transform(({ obj }) => obj.quantity)
  @IsNumber() @Min(0.000001) @Max(1_000_000_000) quantity: number;
}
export class CreateBranchTransferDto {
  @Transform(({ value }) => typeof value === 'string' ? value.toLowerCase() : value)
  @IsUUID('4') requestId: string;
  @IsMongoId() fromBranchId: string;
  @IsMongoId() toBranchId: string;
  @IsMongoId() companyId: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => BranchTransferItemDto) items: BranchTransferItemDto[];
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
export class FilterBranchTransfersDto {
  @IsOptional() @IsMongoId() branchId?: string;
  @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit: number = 20;
}
export class BranchTransferRequestDto {
  @Transform(({ value }) => typeof value === 'string' ? value.toLowerCase() : value)
  @IsUUID('4') requestId: string;
}
