import { IsArray, IsString, IsOptional, MinLength, IsIn, IsEmail, ValidateNested, ValidateIf } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { UserBranchAssignmentDto } from './create-user.dto';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;

  @IsOptional()
  @IsString()
  @IsIn(['ADMIN', 'BRANCH_ADMIN', 'VENDEDOR', 'CAJERO', 'ALMACENERO', 'CONTABILIDAD'])
  role?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  username?: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @ValidateIf((_, value) => value !== undefined && value !== '')
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserBranchAssignmentDto)
  branchAssignments?: UserBranchAssignmentDto[];
}
