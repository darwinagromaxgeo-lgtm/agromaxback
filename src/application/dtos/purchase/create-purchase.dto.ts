import { IsString, IsArray, ValidateNested, IsNumber, IsDateString, IsOptional, IsEnum, Min, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class PurchaseRemisionGuiaDto {
  @IsString() serie: string;
  @IsString() correlativo: string;
  @IsDateString() fecha: string;
}

export class PurchaseItemDto {
  @IsString() productId: string;
  @IsNumber() quantity: number;
  @IsOptional() @IsNumber() unitCost?: number;
  @IsOptional() @IsNumber() unitPriceSinIgv?: number;
  @IsOptional() @IsNumber() unitPriceConIgv?: number;
  @IsOptional() @IsNumber() flete?: number;
  @IsOptional() @IsNumber() otrosCostos?: number;
  @IsOptional() @IsNumber() precioVenta?: number;
  @IsOptional() @IsNumber() precioMinorista?: number;
  @IsOptional() @IsNumber() precioEspecial?: number;
  @IsOptional() @IsNumber() markupPercent?: number;
  @IsOptional() @IsNumber() markupMinoristaPercent?: number;
  @IsOptional() @IsNumber() markupEspecialPercent?: number;
  @IsOptional() @IsNumber() minMarginPercent?: number;
  @IsOptional() @IsString() lotNumber?: string;
  @IsOptional() @IsDateString() expirationDate?: string;
  @IsOptional() @IsString() taxType?: string;
}

export class InstallmentDto {
  @IsNumber() @Min(0.01) amount: number;
  @IsDateString() dueDate: string;
}

export class CreatePurchaseDto {
  @IsString() companyId: string;
  @IsString() supplier: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PurchaseItemDto) items?: PurchaseItemDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PurchaseItemDto) bonificationItems?: PurchaseItemDto[];
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsEnum({ CONTADO: 'CONTADO', CREDITO: 'CREDITO', PENDIENTE_ACUERDO: 'PENDIENTE_ACUERDO' }) paymentType?: string;
  @IsOptional() @IsEnum({ SINGLE_DATE: 'SINGLE_DATE', INSTALLMENTS: 'INSTALLMENTS' }) paymentScheduleType?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => InstallmentDto) installments?: InstallmentDto[];
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsString() supplierRuc?: string;
  @IsOptional() @IsNumber() totalCost?: number;
  @IsOptional() @IsNumber() totalCostUsd?: number;
  @IsOptional() @IsNumber() exchangeRate?: number;
  @IsOptional() @IsString() exchangeRateDate?: string;
  @IsOptional() @IsEnum({ FACTURA: 'FACTURA', BOLETA: 'BOLETA', GUIA: 'GUIA', NOTA_CREDITO: 'NOTA_CREDITO', OTRO: 'OTRO' }) documentType?: string;
  @IsOptional() @IsString() documentSeries?: string;
  @IsOptional() @IsString() documentNumber?: string;
  @IsOptional() @IsDateString() issueDate?: string;
  @IsOptional() @IsBoolean() isHistorical?: boolean;
  @IsOptional() @ValidateNested() @Type(() => PurchaseRemisionGuiaDto) remisionGuia?: PurchaseRemisionGuiaDto;
}
