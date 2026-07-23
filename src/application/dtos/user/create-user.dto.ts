import { IsArray, IsEmail, IsString, MinLength, IsOptional, IsIn, IsMongoId, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class UserBranchAssignmentDto {
  @IsMongoId()
  branchId: string;

  @IsIn(['BRANCH_ADMIN', 'VENDEDOR', 'CAJERO', 'ALMACENERO', 'CONTABILIDAD'])
  role: string;
}

export class CreateUserDto {
  @IsString()
  @MinLength(3)
  username: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  @MinLength(2)
  fullName: string;

  @IsOptional()
  @IsString()
  @IsIn(['ADMIN', 'BRANCH_ADMIN', 'VENDEDOR', 'CAJERO', 'ALMACENERO', 'CONTABILIDAD'])
  role?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserBranchAssignmentDto)
  branchAssignments?: UserBranchAssignmentDto[];
}
