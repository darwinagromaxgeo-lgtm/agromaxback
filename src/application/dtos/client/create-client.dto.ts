import { IsString, IsOptional, IsEmail } from 'class-validator';

export class CreateClientDto {
  @IsString() name: string;
  @IsOptional() @IsString() documentNumber?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
}
