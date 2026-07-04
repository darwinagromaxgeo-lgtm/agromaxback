import { IsString, IsDateString } from 'class-validator';

export class UpdateRemisionGuiaDto {
  @IsString() serie: string;
  @IsString() correlativo: string;
  @IsDateString() fecha: string;
}
