import { IsArray, IsString, IsOptional, MinLength, IsIn, IsEmail, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
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

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserBranchAssignmentDto)
  branchAssignments?: UserBranchAssignmentDto[];
}
