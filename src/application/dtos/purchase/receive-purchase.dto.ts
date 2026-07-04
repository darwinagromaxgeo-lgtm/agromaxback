import { IsString, IsArray, ValidateNested, IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ReceiveItemDto {
  @IsString() productId: string;
  @IsNumber() @Min(0.01) quantity: number;
}

export class RegisterReceptionDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => ReceiveItemDto)
  items: ReceiveItemDto[];

  @IsOptional() @IsString() notes?: string;
}
