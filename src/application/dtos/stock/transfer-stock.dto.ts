import { IsString, IsArray, ValidateNested, IsNumber, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class LotAllocationDto {
  @IsString() lotId: string;
  @IsNumber() quantity: number;
}

export class TransferItemDto {
  @IsString() productId: string;
  @IsNumber() quantity: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => LotAllocationDto) lotAllocations?: LotAllocationDto[];
}

export class TransferStockDto {
  @IsString() fromCompanyId: string;
  @IsString() toCompanyId: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => TransferItemDto) items: TransferItemDto[];
  @IsOptional() @IsString() notes?: string;
}
