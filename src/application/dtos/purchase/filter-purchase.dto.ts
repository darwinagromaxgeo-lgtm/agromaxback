import { IsOptional, IsString, IsDateString } from 'class-validator';
import { PaginationDto } from '../common/pagination.dto';

export class FilterPurchaseDto extends PaginationDto {
  @IsOptional() @IsString() companyId?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
}
