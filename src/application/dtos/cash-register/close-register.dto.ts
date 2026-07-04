import { IsOptional, IsString } from 'class-validator';

export class CloseRegisterDto {
  @IsOptional() @IsString() notes?: string;
}
