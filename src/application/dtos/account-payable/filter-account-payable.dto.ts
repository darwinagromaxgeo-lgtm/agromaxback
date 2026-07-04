import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../common/pagination.dto';

export class FilterAccountPayableDto extends PaginationDto {
  @IsOptional() @IsString() supplier?: string;
  @IsOptional() @IsString() status?: string;
}
