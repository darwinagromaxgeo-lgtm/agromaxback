import { IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';

export class UpdatePriceTierDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() priority?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
