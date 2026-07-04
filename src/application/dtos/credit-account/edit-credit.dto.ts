import { IsNumber, Min } from 'class-validator';

export class EditCreditDto {
  @IsNumber() @Min(0.01) totalAmount: number;
}
