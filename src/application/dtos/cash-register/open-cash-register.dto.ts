import { IsNumber, IsOptional, Min } from 'class-validator';

export class OpenCashRegisterDto {
  @IsOptional() @IsNumber() @Min(0) openingBalance?: number;
}
