import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsDateString, IsIn, IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';
import { BillingDocumentStatus, BillingDocumentType } from '../../../domain/entities/billing-document.entity';

export class FilterBillingDocumentsDto {
  @IsOptional() @IsMongoId()
  saleId?: string;
  @ApiPropertyOptional({ description: 'Hasta 50 referencias de venta, separadas por coma' })
  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.split(',') : value)
  @IsArray() @ArrayNotEmpty() @ArrayMaxSize(50) @IsMongoId({ each: true })
  saleIds?: string[];
  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  companyId?: string;

  @ApiPropertyOptional({ enum: ['FACTURA', 'BOLETA'] })
  @IsOptional()
  @IsIn(['FACTURA', 'BOLETA'])
  documentType?: BillingDocumentType;

  @ApiPropertyOptional({ enum: ['DRAFT', 'SENDING', 'PENDING', 'ACCEPTED', 'REJECTED', 'UNKNOWN', 'DISCARDED'] })
  @IsOptional()
  @IsIn(['DRAFT', 'SENDING', 'PENDING', 'ACCEPTED', 'REJECTED', 'UNKNOWN', 'DISCARDED'])
  status?: BillingDocumentStatus;

  @ApiPropertyOptional({ example: '2026-11-14' })
  @IsOptional()
  @IsDateString({ strict: true })
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-11-14' })
  @IsOptional()
  @IsDateString({ strict: true })
  endDate?: string;

  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 15, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 15;
}
