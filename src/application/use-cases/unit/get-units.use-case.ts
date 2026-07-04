import { Injectable, Inject } from '@nestjs/common';
import { IUnitRepository, UNIT_REPOSITORY } from '../../../domain/repositories/unit.repository';

@Injectable()
export class GetUnitsUseCase {
  constructor(
    @Inject(UNIT_REPOSITORY) private readonly unitRepository: IUnitRepository,
  ) {}

  async execute() {
    return this.unitRepository.findAll();
  }
}
