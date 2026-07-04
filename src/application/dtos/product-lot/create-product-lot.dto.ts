import { IsString, IsOptional, IsNumber, IsDateString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductLotDto {
  @IsString() productId: string;
  @IsString() companyId: string;
  @IsString() lotNumber: string;
  @IsOptional() @IsDateString() expirationDate?: string;
  @IsNumber() @Min(0.01) @Type(() => Number) quantity: number;
}
