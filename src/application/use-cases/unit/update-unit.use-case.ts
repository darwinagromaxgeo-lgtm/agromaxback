import { Injectable, Inject } from '@nestjs/common';
import { IUnitRepository, UNIT_REPOSITORY } from '../../../domain/repositories/unit.repository';
import { UpdateUnitDto } from '../../dtos/unit/update-unit.dto';

@Injectable()
export class UpdateUnitUseCase {
  constructor(
    @Inject(UNIT_REPOSITORY) private readonly unitRepository: IUnitRepository,
  ) {}

  async execute(id: string, dto: UpdateUnitDto) {
    return this.unitRepository.update(id, dto);
  }
}
