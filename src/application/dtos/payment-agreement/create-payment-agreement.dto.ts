import { IsArray, IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class AgreementInstallmentDto {
  @IsNumber() @Min(0.01) amount: number;
  @IsDateString() dueDate: string;
}

export class AgreementRemisionGuiaDto {
  @IsString() serie: string;
  @IsString() correlativo: string;
  @IsString() fecha: string;
}

export class CreatePaymentAgreementDto {
  @IsArray() @IsString({ each: true }) accountPayableIds: string[];
  @IsEnum(['SINGLE_DATE', 'INSTALLMENTS']) paymentScheduleType: 'SINGLE_DATE' | 'INSTALLMENTS';
  @IsOptional() @IsEnum(['PEN', 'USD']) currency?: 'PEN' | 'USD';
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AgreementInstallmentDto) installments?: AgreementInstallmentDto[];
  @IsOptional() @IsEnum(['FACTURA', 'BOLETA']) documentType?: 'FACTURA' | 'BOLETA';
  @IsOptional() @IsString() documentSeries?: string;
  @IsOptional() @IsString() documentNumber?: string;
  @IsOptional() @ValidateNested() @Type(() => AgreementRemisionGuiaDto) remisionGuia?: AgreementRemisionGuiaDto;
  @IsOptional() @IsString() notes?: string;
}
