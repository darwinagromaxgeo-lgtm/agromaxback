import { IsString, IsOptional } from 'class-validator';

export class CreateUnitDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  abbreviation?: string;
}
