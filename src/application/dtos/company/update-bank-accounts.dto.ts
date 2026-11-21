import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min, ValidateNested } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const digits = ({ value }: { value: unknown }) => typeof value === 'string' ? value.replace(/[\s-]/g, '') : value;

export class CompanyBankAccountDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(80) bank: string;
  @IsIn(['PEN', 'USD']) currency: 'PEN' | 'USD';
  @Transform(digits) @IsString() @Matches(/^\d{6,34}$/, { message: 'La cuenta debe contener entre 6 y 34 dígitos' }) accountNumber: string;
  @Transform(digits) @IsOptional() @IsString() @Matches(/^\d{20}$/, { message: 'El CCI debe contener 20 dígitos' }) cci?: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(160) holder: string;
  @IsBoolean() isActive: boolean;
}

export class UpdateCompanyBankAccountsDto {
  @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => CompanyBankAccountDto)
  accounts: CompanyBankAccountDto[];
  @IsInt() @Min(0) expectedRevision: number;
}
