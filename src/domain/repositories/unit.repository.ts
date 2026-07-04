import { UnitEntity } from '../entities/unit.entity';

export interface IUnitRepository {
  create(unit: UnitEntity): Promise<UnitEntity>;
  findAll(): Promise<UnitEntity[]>;
  findById(id: string): Promise<UnitEntity | null>;
  findByName(name: string): Promise<UnitEntity | null>;
  update(id: string, unit: Partial<UnitEntity>): Promise<UnitEntity | null>;
  delete(id: string): Promise<void>;
}

export const UNIT_REPOSITORY = 'UNIT_REPOSITORY';
