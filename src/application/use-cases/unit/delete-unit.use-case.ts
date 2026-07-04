import { Injectable, Inject } from '@nestjs/common';
import { IUnitRepository, UNIT_REPOSITORY } from '../../../domain/repositories/unit.repository';

@Injectable()
export class DeleteUnitUseCase {
  constructor(@Inject(UNIT_REPOSITORY) private readonly repo: IUnitRepository) {}
  async execute(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
