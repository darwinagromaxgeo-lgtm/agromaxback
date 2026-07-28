import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveStockRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class RejectStockRequestDto {
  @IsString()
  @MaxLength(500)
  reason: string;
}
