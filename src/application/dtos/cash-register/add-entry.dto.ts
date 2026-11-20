import { IsString, IsNumber, IsEnum, IsOptional, Min, ValidateNested, IsDateString, IsMongoId, IsNotEmpty } from 'class-validator';
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
  @IsString() @IsNotEmpty() description: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount: number;
  @IsOptional() @IsMongoId() paymentMethodId?: string;
  @IsOptional() @IsString() referenceId?: string;
  @IsOptional() @IsString() referenceType?: string;
  @IsOptional() @IsString() voucherType?: string;
  @IsOptional() @IsString() voucherSeries?: string;
  @IsOptional() @IsString() voucherNumber?: string;
  @IsOptional() @ValidateNested() @Type(() => RemisionGuiaDto) remisionGuia?: RemisionGuiaDto;
}
