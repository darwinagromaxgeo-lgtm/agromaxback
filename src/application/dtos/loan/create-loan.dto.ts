import { IsString, IsArray, ValidateNested, IsNumber, IsOptional, IsDateString, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

export class LoanItemDto {
  @IsString()
  productId: string;

  @IsString()
  companyId: string;

  @IsNumber()
  quantity: number;
}

export class CreateLoanDto {
  @IsString()
  borrowerName: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LoanItemDto)
  items: LoanItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}
