import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class UpdateUnitDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() abbreviation?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
