import { IsOptional, IsString, IsDateString } from 'class-validator';
import { PaginationDto } from '../common/pagination.dto';

export class FilterCashRegisterDto extends PaginationDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
}
