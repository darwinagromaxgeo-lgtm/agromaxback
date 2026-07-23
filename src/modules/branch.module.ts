import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ManageBranchesUseCase } from '../application/use-cases/branch/manage-branches.use-case';
import { BRANCH_REPOSITORY } from '../domain/repositories/branch.repository';
import { MongoBranchRepository } from '../infrastructure/database/mongodb/repositories/mongo-branch.repository';
import { BranchDocument, BranchSchema } from '../infrastructure/database/mongodb/schemas/branch.schema';
import { BranchController } from '../presentation/controllers/branch.controller';
import { UserModule } from './user.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: BranchDocument.name, schema: BranchSchema }]),
    UserModule,
  ],
  controllers: [BranchController],
  providers: [
    { provide: BRANCH_REPOSITORY, useClass: MongoBranchRepository },
    ManageBranchesUseCase,
  ],
  exports: [BRANCH_REPOSITORY],
})
export class BranchModule {}
