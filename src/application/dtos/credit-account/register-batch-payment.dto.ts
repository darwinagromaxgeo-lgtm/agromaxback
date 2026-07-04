import { IsString, IsNumber, IsEnum, IsOptional, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

class AllocationDto {
  @IsString() creditId: string;
  @IsNumber() @Min(0.01) amount: number;
}

export class RegisterBatchPaymentDto {
  @IsString() clientId: string;
  @IsString() paymentMethodId: string;
  @IsEnum(['EXPLICIT', 'FIFO']) mode: 'EXPLICIT' | 'FIFO';
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AllocationDto) allocations?: AllocationDto[];
  @IsOptional() @IsNumber() @Min(0.01) totalAmount?: number;
  @IsOptional() @IsString() notes?: string;
}
