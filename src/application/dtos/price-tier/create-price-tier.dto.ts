import { IsString, IsOptional, IsNumber } from 'class-validator';

export class CreatePriceTierDto {
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() priority?: number;
}
