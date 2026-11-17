import { Type } from 'class-transformer';
import { IsDefined, IsEmail, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

export class BillingReceiverDto {
  @IsIn(['DNI', 'RUC', 'UNIDENTIFIED']) documentType: 'DNI' | 'RUC' | 'UNIDENTIFIED';
  @IsString() @MaxLength(250) name: string;
  @IsOptional() @IsString() @MaxLength(11) documentNumber?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsEmail() @MaxLength(254) email?: string;
}

export class UpdateBillingReceiverDto {
  @IsDefined() @ValidateNested() @Type(() => BillingReceiverDto) receiver: BillingReceiverDto;
  @IsInt() @Min(0) expectedRevision: number;
}
