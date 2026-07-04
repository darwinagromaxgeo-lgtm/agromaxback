import { IsOptional, IsString, IsNumber, IsDateString, IsEnum, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

class UpdateInstallmentDto {
  @IsNumber() @Min(0) amount: number;
  @IsDateString() dueDate: string;
}

export class UpdatePurchaseDto {
  @IsOptional() @IsString() supplier?: string;
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsString() supplierRuc?: string;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsEnum(['FACTURA', 'BOLETA', 'GUIA', 'NOTA_CREDITO', 'OTRO']) documentType?: string;
  @IsOptional() @IsString() documentSeries?: string;
  @IsOptional() @IsString() documentNumber?: string;
  @IsOptional() @IsDateString() issueDate?: string;
  @IsOptional() @IsEnum(['CONTADO', 'CREDITO', 'PENDIENTE_ACUERDO']) paymentType?: string;
  @IsOptional() @IsEnum(['SINGLE_DATE', 'INSTALLMENTS', 'PENDIENTE_ACUERDO']) paymentScheduleType?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => UpdateInstallmentDto) installments?: UpdateInstallmentDto[];
  @IsOptional() @IsNumber() @Min(0) totalCostUsd?: number;
  @IsOptional() @IsNumber() @Min(0) exchangeRate?: number;
}
