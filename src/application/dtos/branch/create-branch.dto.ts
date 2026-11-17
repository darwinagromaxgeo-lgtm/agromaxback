import { ArrayMinSize, IsArray, IsBoolean, IsMongoId, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateBranchDto {
  @IsString()
  @MinLength(2)
  @Matches(/^[A-Za-z0-9_-]+$/)
  code: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsMongoId({ each: true })
  companyIds: string[];

  @IsOptional() @IsMongoId() defaultCompanyId?: string;
  @IsOptional() @IsString() @Matches(/^[1-9A-Z]$/) billingSeriesCode?: string;
  @IsOptional() @IsString() @Matches(/^\d{4}$/) sunatEstablishmentCode?: string;
  @IsOptional() @IsBoolean() isMain?: boolean;
}
