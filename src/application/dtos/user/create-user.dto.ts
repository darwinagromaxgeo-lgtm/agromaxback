import { IsArray, IsBoolean, IsEmail, IsString, MinLength, IsOptional, IsIn, IsMongoId, ValidateIf, ValidateNested } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class UserBranchAssignmentDto {
  @IsMongoId()
  branchId: string;

  @IsIn(['BRANCH_ADMIN', 'VENDEDOR', 'CAJERO', 'ALMACENERO', 'CONTABILIDAD'])
  role: string;
}

export class CreateUserDto {
  @Transform(({ obj, key }) => obj[key])
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  canTransferStock?: boolean;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(3)
  username: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() || undefined : value)
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @MinLength(6)
  password: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
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
