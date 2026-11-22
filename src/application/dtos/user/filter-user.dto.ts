import { IsOptional, IsString, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../common/pagination.dto';

export class FilterUserDto extends PaginationDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @Transform(({ obj, key }) => obj[key] === 'true' ? true : obj[key] === 'false' ? false : obj[key])
  @IsBoolean()
  isActive?: boolean;
}
