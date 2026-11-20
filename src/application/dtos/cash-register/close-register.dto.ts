import { IsOptional, IsString, IsNumber, Min, IsInt } from 'class-validator';

export class CloseRegisterDto {
  @IsOptional() @IsString() notes?: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) countedCash: number;
  @IsInt() @Min(0) expectedRevision: number;
}
