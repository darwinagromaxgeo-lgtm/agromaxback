import { SellerAccess } from '../../common/decorators/seller-access.decorator';
import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { CreateCompanyUseCase } from '../../application/use-cases/company/create-company.use-case';
import { GetCompaniesUseCase } from '../../application/use-cases/company/get-companies.use-case';
import { UpdateCompanyUseCase } from '../../application/use-cases/company/update-company.use-case';
import { DeleteCompanyUseCase } from '../../application/use-cases/company/delete-company.use-case';
import { CreateCompanyDto } from '../../application/dtos/company/create-company.dto';
import { UpdateCompanyDto } from '../../application/dtos/company/update-company.dto';

@ApiTags('Companies')
@ApiBearerAuth('JWT')
@Controller('companies')
export class CompanyController {
  constructor(
    private readonly createCompany: CreateCompanyUseCase,
    private readonly getCompanies: GetCompaniesUseCase,
    private readonly updateCompany: UpdateCompanyUseCase,
    private readonly deleteCompany: DeleteCompanyUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crear empresa', description: 'Registra una nueva empresa (RUC) en el sistema' })
  async create(@Body() dto: CreateCompanyDto) { return this.createCompany.execute(dto); }

  @Get()
  @ApiOperation({ summary: 'Listar empresas', description: 'Obtiene todas las empresas registradas' })
  @SellerAccess()
  async findAll() { return this.getCompanies.execute(); }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar empresa', description: 'Modifica los datos de una empresa existente' })
  @ApiParam({ name: 'id', description: 'ID de la empresa' })
  async update(@Param('id') id: string, @Body() dto: UpdateCompanyDto) { return this.updateCompany.execute(id, dto); }

  @Delete(':id')
  @ApiOperation({ summary: 'Desactivar empresa' })
  @ApiParam({ name: 'id', description: 'ID de la empresa' })
  async remove(@Param('id') id: string) { return this.deleteCompany.execute(id); }
}
