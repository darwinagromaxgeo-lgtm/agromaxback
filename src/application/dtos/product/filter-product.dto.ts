import { IsOptional, IsString, IsBoolean, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../common/pagination.dto';

export class FilterProductDto extends PaginationDto {
  @IsOptional() @Transform(({ obj, key }) => obj[key] === 'true' ? true : obj[key] === 'false' ? false : obj[key]) @IsBoolean() billingEnabled?: boolean;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() activeIngredient?: string;
  @IsOptional() @IsString() control?: string;
  @IsOptional() @IsString() supplier?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsIn(['asc', 'desc']) sort?: 'asc' | 'desc';
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() isActive?: boolean;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() sellableOnly?: boolean;
}
