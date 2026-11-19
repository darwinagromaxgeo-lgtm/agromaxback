import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsMongoId, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

class CreditNoteItemDto {
  @IsInt() @Min(0) itemIndex: number;
  @IsNumber({ maxDecimalPlaces:6 }) @Min(0.000001) quantity: number;
}
export class PreviewCreditNoteDto {
  @IsMongoId() originalDocumentId: string;
  @IsIn(['TOTAL','PARTIAL']) returnType: 'TOTAL' | 'PARTIAL';
  @IsString() @MinLength(1) @MaxLength(500) reason: string;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each:true }) @Type(() => CreditNoteItemDto)
  items?: CreditNoteItemDto[];
}
export class CreateCreditNoteDto extends PreviewCreditNoteDto {
  @IsUUID('4') requestId: string;
}
export class FilterCreditNotesDto {
  @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit: number = 15;
  @IsOptional() @IsMongoId() originalDocumentId?: string;
  @IsOptional() @IsMongoId() companyId?: string;
  @IsOptional() @IsIn(['DRAFT','SENDING','PENDING','ACCEPTED','REJECTED','UNKNOWN','DISCARDED']) status?: string;
}
