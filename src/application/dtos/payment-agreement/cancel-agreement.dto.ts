import { IsString, MinLength } from 'class-validator';

export class CancelAgreementDto {
  @IsString() @MinLength(5) reason: string;
}
