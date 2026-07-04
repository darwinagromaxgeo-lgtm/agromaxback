import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class RegisterAPPaymentDto {
  @IsNumber() @Min(0.01) amount: number;
  @IsOptional() @IsString() codigoTransferencia?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsBoolean() isFullPayment?: boolean;
}
