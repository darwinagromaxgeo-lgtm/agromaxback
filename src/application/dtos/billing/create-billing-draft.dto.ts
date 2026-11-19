import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsMongoId, IsOptional, ValidateNested } from 'class-validator';
import { BillingReceiverDto } from './billing-receiver.dto';
import { BillingDocumentType, BillingTaxType } from '../../../domain/entities/billing-document.entity';

export class CreateBillingDraftDto {
  @IsOptional() @IsMongoId()
  replacesDocumentId?: string;
  @IsOptional() @ValidateNested() @Type(() => BillingReceiverDto)
  receiver?: BillingReceiverDto;
  @ApiProperty()
  @IsMongoId()
  saleId: string;

  @ApiProperty()
  @IsMongoId()
  companyId: string;

  @ApiProperty({ enum: ['FACTURA', 'BOLETA'] })
  @IsIn(['FACTURA', 'BOLETA'])
  documentType: BillingDocumentType;

  @ApiProperty({ enum: ['GRAVADO', 'EXONERADO', 'INAFECTO'] })
  @IsIn(['GRAVADO', 'EXONERADO', 'INAFECTO'])
  taxType: BillingTaxType;

  @ApiPropertyOptional({ description: 'Confirmación de revisión tributaria para ventas sin datos históricos de impuestos' })
  @IsOptional()
  @Transform(({ obj }) => obj.legacyTaxConfirmed)
  @IsBoolean()
  legacyTaxConfirmed?: boolean;
}
