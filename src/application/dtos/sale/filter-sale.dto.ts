import { IsOptional, IsString, IsDateString } from 'class-validator';
import { PaginationDto } from '../common/pagination.dto';

export class FilterSaleDto extends PaginationDto {
  @IsOptional() @IsString() companyId?: string;
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsString() voucherType?: string;
}
