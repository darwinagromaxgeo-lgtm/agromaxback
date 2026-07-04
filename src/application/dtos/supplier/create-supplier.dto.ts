import { IsString, IsOptional } from 'class-validator';

export class CreateSupplierDto {
  @IsString() ruc: string;
  @IsString() businessName: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
}
