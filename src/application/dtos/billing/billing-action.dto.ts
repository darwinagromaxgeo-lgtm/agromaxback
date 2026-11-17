import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { Equals, IsIn, IsInt, IsMongoId, IsOptional, Min } from 'class-validator';

export class BillingDocumentIdDto {
  @IsMongoId()
  id: string;
}

export class BillingFileParamsDto extends BillingDocumentIdDto {
  @IsIn(['pdf', 'xml', 'cdr'])
  format: 'pdf' | 'xml' | 'cdr';
}

export class IssueBillingDocumentDto {
  @IsOptional() @IsInt() @Min(0)
  receiverRevision?: number;
  @ApiProperty({ example: true, description: 'Confirmación explícita de envío del comprobante al servicio de facturación' })
  @Transform(({ obj }) => obj.confirm)
  @Equals(true, { message: 'Confirma explícitamente la emisión del comprobante' })
  confirm: boolean;
}
