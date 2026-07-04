import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class RegisterAgreementPaymentDto {
  @IsNumber() @Min(0.01) amount: number;
  @IsString() codigoTransferencia: string;
  @IsOptional() @IsString() notes?: string;
}
