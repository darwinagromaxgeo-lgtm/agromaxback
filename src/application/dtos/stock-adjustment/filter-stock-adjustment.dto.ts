import { IsOptional, IsString, IsDateString } from 'class-validator';
import { PaginationDto } from '../common/pagination.dto';

export class FilterStockAdjustmentDto extends PaginationDto {
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsString() companyId?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
}
