import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, Min, MinLength } from 'class-validator';

export class AdjustOpeningBalanceDto {
  @ApiProperty({ description: 'Nuevo monto de apertura', example: 50 })
  @IsNumber()
  @Min(0)
  openingBalance: number;

  @ApiProperty({ description: 'Razón del ajuste', example: 'Caja chica de S/50 que no se registró al abrir' })
  @IsString()
  @MinLength(3)
  reason: string;
}
