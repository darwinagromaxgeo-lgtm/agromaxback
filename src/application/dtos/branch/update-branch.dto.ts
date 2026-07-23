import { ArrayMinSize, IsArray, IsBoolean, IsMongoId, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class UpdateBranchDto {
  @IsOptional() @IsString() @MinLength(2) @Matches(/^[A-Za-z0-9_-]+$/) code?: string;
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @IsMongoId({ each: true }) companyIds?: string[];
  @IsOptional() @IsMongoId() defaultCompanyId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isMain?: boolean;
}
