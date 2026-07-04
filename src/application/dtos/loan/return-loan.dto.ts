import { IsString, IsArray, ValidateNested, IsNumber, IsOptional, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

export class ReturnLoanItemDto {
  @IsString()
  productId: string;

  @IsString()
  companyId: string;

  @IsNumber()
  quantity: number;
}

export class ReturnLoanDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReturnLoanItemDto)
  items: ReturnLoanItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}
