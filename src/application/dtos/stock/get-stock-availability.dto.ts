import { IsMongoId } from 'class-validator';

export class GetStockAvailabilityParamsDto {
  @IsMongoId()
  productId: string;
}

export class GetStockAvailabilityQueryDto {
  @IsMongoId()
  companyId: string;
}
