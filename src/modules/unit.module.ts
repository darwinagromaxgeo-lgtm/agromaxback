import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UnitDocument, UnitSchema } from '../infrastructure/database/mongodb/schemas/unit.schema';
import { MongoUnitRepository } from '../infrastructure/database/mongodb/repositories/mongo-unit.repository';
import { UNIT_REPOSITORY } from '../domain/repositories/unit.repository';
import { CreateUnitUseCase } from '../application/use-cases/unit/create-unit.use-case';
import { GetUnitsUseCase } from '../application/use-cases/unit/get-units.use-case';
import { UpdateUnitUseCase } from '../application/use-cases/unit/update-unit.use-case';
import { DeleteUnitUseCase } from '../application/use-cases/unit/delete-unit.use-case';
import { UnitController } from '../presentation/controllers/unit.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: UnitDocument.name, schema: UnitSchema }])],
  controllers: [UnitController],
  providers: [
    { provide: UNIT_REPOSITORY, useClass: MongoUnitRepository },
    CreateUnitUseCase,
    GetUnitsUseCase,
    UpdateUnitUseCase,
    DeleteUnitUseCase,
  ],
  exports: [UNIT_REPOSITORY],
})
export class UnitModule {}
