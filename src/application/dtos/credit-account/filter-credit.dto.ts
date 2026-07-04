import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../common/pagination.dto';

export class FilterCreditDto extends PaginationDto {
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() status?: string;
}
