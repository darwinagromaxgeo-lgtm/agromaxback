import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CompanyDocument, CompanySchema } from '../infrastructure/database/mongodb/schemas/company.schema';
import { MongoCompanyRepository } from '../infrastructure/database/mongodb/repositories/mongo-company.repository';
import { COMPANY_REPOSITORY } from '../domain/repositories/company.repository';
import { CreateCompanyUseCase } from '../application/use-cases/company/create-company.use-case';
import { GetCompaniesUseCase } from '../application/use-cases/company/get-companies.use-case';
import { UpdateCompanyUseCase } from '../application/use-cases/company/update-company.use-case';
import { DeleteCompanyUseCase } from '../application/use-cases/company/delete-company.use-case';
import { CompanyController } from '../presentation/controllers/company.controller';
import { UpdateCompanyBankAccountsUseCase } from '../application/use-cases/company/update-bank-accounts.use-case';

@Module({
  imports: [MongooseModule.forFeature([{ name: CompanyDocument.name, schema: CompanySchema }])],
  controllers: [CompanyController],
  providers: [{ provide: COMPANY_REPOSITORY, useClass: MongoCompanyRepository }, CreateCompanyUseCase, GetCompaniesUseCase, UpdateCompanyUseCase, DeleteCompanyUseCase, UpdateCompanyBankAccountsUseCase],
  exports: [COMPANY_REPOSITORY],
})
export class CompanyModule {}
