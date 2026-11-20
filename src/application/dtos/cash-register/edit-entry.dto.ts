import { IsNumber, IsString, Min, IsOptional, IsMongoId, MinLength } from 'class-validator';

export class EditEntryDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount: number;
  @IsString() @MinLength(5) reason: string;
  @IsOptional() @IsMongoId() paymentMethodId?: string;
  @IsOptional() @IsString() voucherType?: string;
  @IsOptional() @IsString() voucherSeries?: string;
  @IsOptional() @IsString() voucherNumber?: string;
}
