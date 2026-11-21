import { AccountingRead } from '../../common/decorators/accounting-access.decorator';
import { SellerAccess } from '../../common/decorators/seller-access.decorator';
import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { CreateCompanyUseCase } from '../../application/use-cases/company/create-company.use-case';
import { GetCompaniesUseCase } from '../../application/use-cases/company/get-companies.use-case';
import { UpdateCompanyUseCase } from '../../application/use-cases/company/update-company.use-case';
import { DeleteCompanyUseCase } from '../../application/use-cases/company/delete-company.use-case';
import { CreateCompanyDto } from '../../application/dtos/company/create-company.dto';
import { UpdateCompanyDto } from '../../application/dtos/company/update-company.dto';
import { UpdateCompanyBankAccountsDto } from '../../application/dtos/company/update-bank-accounts.dto';
import { UpdateCompanyBankAccountsUseCase } from '../../application/use-cases/company/update-bank-accounts.use-case';
import { Roles } from '../../common/decorators/roles.decorator';
import { IsMongoId } from 'class-validator';

class CompanyIdParams { @IsMongoId() id: string; }

@ApiTags('Companies')
@ApiBearerAuth('JWT')
@AccountingRead()
@Controller('companies')
export class CompanyController {
  constructor(
    private readonly createCompany: CreateCompanyUseCase,
    private readonly getCompanies: GetCompaniesUseCase,
    private readonly updateCompany: UpdateCompanyUseCase,
    private readonly deleteCompany: DeleteCompanyUseCase,
    private readonly updateBankAccounts: UpdateCompanyBankAccountsUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crear empresa', description: 'Registra una nueva empresa (RUC) en el sistema' })
  async create(@Body() dto: CreateCompanyDto) { return this.createCompany.execute(dto); }

  @Get()
  @ApiOperation({ summary: 'Listar empresas', description: 'Obtiene todas las empresas registradas' })
  @SellerAccess()
  async findAll() { return this.getCompanies.execute(); }

  @Roles('ADMIN')
  @Put(':id/bank-accounts')
  @ApiOperation({ summary: 'Configurar las cuentas bancarias de una empresa para las cotizaciones' })
  bankAccounts(@Param() params: CompanyIdParams, @Body() dto: UpdateCompanyBankAccountsDto) {
    return this.updateBankAccounts.execute(params.id, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar empresa', description: 'Modifica los datos de una empresa existente' })
  @ApiParam({ name: 'id', description: 'ID de la empresa' })
  async update(@Param('id') id: string, @Body() dto: UpdateCompanyDto) { return this.updateCompany.execute(id, dto); }

  @Delete(':id')
  @ApiOperation({ summary: 'Desactivar empresa' })
  @ApiParam({ name: 'id', description: 'ID de la empresa' })
  async remove(@Param('id') id: string) { return this.deleteCompany.execute(id); }
}
