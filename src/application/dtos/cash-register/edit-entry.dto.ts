import { IsNumber, IsString, Min, IsOptional } from 'class-validator';

export class EditEntryDto {
  @IsNumber() @Min(0.01) amount: number;
  @IsString() reason: string;
  @IsOptional() @IsString() voucherType?: string;
  @IsOptional() @IsString() voucherSeries?: string;
  @IsOptional() @IsString() voucherNumber?: string;
}
