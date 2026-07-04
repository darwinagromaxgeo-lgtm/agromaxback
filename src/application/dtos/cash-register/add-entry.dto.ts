import { IsString, IsNumber, IsEnum, IsOptional, Min, ValidateNested, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { CashRegisterEntryType, CashRegisterEntryCategory } from '../../../domain/enums';

export class RemisionGuiaDto {
  @IsString() serie: string;
  @IsString() correlativo: string;
  @IsDateString() fecha: string;
}

export class AddEntryDto {
  @IsEnum(CashRegisterEntryType) type: CashRegisterEntryType;
  @IsEnum(CashRegisterEntryCategory) category: CashRegisterEntryCategory;
  @IsString() description: string;
  @IsNumber() @Min(0.01) amount: number;
  @IsOptional() @IsString() referenceId?: string;
  @IsOptional() @IsString() referenceType?: string;
  @IsOptional() @IsString() voucherType?: string;
  @IsOptional() @IsString() voucherSeries?: string;
  @IsOptional() @IsString() voucherNumber?: string;
  @IsOptional() @ValidateNested() @Type(() => RemisionGuiaDto) remisionGuia?: RemisionGuiaDto;
}
