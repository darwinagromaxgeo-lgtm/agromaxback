import { IsString, IsOptional, Length } from 'class-validator';

export class CreateCompanyDto {
  @IsString() name: string;
  @IsString() @Length(11, 11, { message: 'RUC must be exactly 11 digits' }) ruc: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
}
