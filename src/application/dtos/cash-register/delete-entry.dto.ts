import { IsString } from 'class-validator';

export class DeleteEntryDto {
  @IsString() reason: string;
}
