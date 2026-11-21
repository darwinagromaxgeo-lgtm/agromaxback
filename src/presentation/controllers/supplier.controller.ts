import { AccountingRead } from '../../common/decorators/accounting-access.decorator';
import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { CreateSupplierUseCase } from '../../application/use-cases/supplier/create-supplier.use-case';
import { GetSuppliersUseCase } from '../../application/use-cases/supplier/get-suppliers.use-case';
import { GetSupplierByRucUseCase } from '../../application/use-cases/supplier/get-supplier-by-ruc.use-case';
import { CreateSupplierDto } from '../../application/dtos/supplier/create-supplier.dto';
import { PaginationDto } from '../../application/dtos/common/pagination.dto';

@ApiTags('Suppliers')
@ApiBearerAuth('JWT')
@AccountingRead()
@Controller('suppliers')
export class SupplierController {
  constructor(
    private readonly createSupplier: CreateSupplierUseCase,
    private readonly getSuppliers: GetSuppliersUseCase,
    private readonly getSupplierByRuc: GetSupplierByRucUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crear proveedor', description: 'Crea un proveedor o retorna el existente si el RUC ya está registrado' })
  async create(@Body() dto: CreateSupplierDto) { return this.createSupplier.execute(dto); }

  @Get()
  @ApiOperation({ summary: 'Listar proveedores', description: 'Obtiene lista paginada de proveedores' })
  async findAll(@Query() filter: PaginationDto) { return this.getSuppliers.execute(filter); }

  @Get('ruc/:ruc')
  @ApiOperation({ summary: 'Buscar por RUC', description: 'Busca un proveedor por su RUC en la BD local' })
  @ApiParam({ name: 'ruc', description: 'Número de RUC' })
  async findByRuc(@Param('ruc') ruc: string) { return this.getSupplierByRuc.execute(ruc); }
}
