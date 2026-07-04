import { Injectable, Inject, ConflictException } from '@nestjs/common';
import { IUnitRepository, UNIT_REPOSITORY } from '../../../domain/repositories/unit.repository';
import { CreateUnitDto } from '../../dtos/unit/create-unit.dto';

@Injectable()
export class CreateUnitUseCase {
  constructor(
    @Inject(UNIT_REPOSITORY) private readonly unitRepository: IUnitRepository,
  ) {}

  async execute(dto: CreateUnitDto) {
    const existing = await this.unitRepository.findByName(dto.name);
    if (existing) throw new ConflictException('Ya existe una unidad con ese nombre');
    return this.unitRepository.create({ ...dto, isActive: true });
  }
}
