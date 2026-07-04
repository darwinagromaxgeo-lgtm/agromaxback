import { IsString, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateVoucherDto {
  @ApiProperty({ description: 'Tipo de comprobante', enum: ['NONE', 'BOLETA', 'FACTURA'] })
  @IsString()
  @IsIn(['NONE', 'BOLETA', 'FACTURA'])
  voucherType: string;
}
