import { AccountingRead } from '../../common/decorators/accounting-access.decorator';
import { SellerAccess } from '../../common/decorators/seller-access.decorator';
import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { CreatePriceTierUseCase } from '../../application/use-cases/price-tier/create-price-tier.use-case';
import { GetPriceTiersUseCase } from '../../application/use-cases/price-tier/get-price-tiers.use-case';
import { UpdatePriceTierUseCase } from '../../application/use-cases/price-tier/update-price-tier.use-case';
import { CreatePriceTierDto } from '../../application/dtos/price-tier/create-price-tier.dto';
import { UpdatePriceTierDto } from '../../application/dtos/price-tier/update-price-tier.dto';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Price Tiers')
@ApiBearerAuth('JWT')
@AccountingRead()
@Controller('price-tiers')
export class PriceTierController {
  constructor(
    private readonly createPriceTier: CreatePriceTierUseCase,
    private readonly getPriceTiers: GetPriceTiersUseCase,
    private readonly updatePriceTier: UpdatePriceTierUseCase,
  ) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Crear rango de precio', description: 'Define un nuevo rango de precio para productos' })
  async create(@Body() dto: CreatePriceTierDto) { return this.createPriceTier.execute(dto); }

  @Get()
  @ApiOperation({ summary: 'Listar rangos de precio', description: 'Obtiene todos los rangos de precio (filtro opcional por activos)' })
  @ApiQuery({ name: 'activeOnly', required: false, description: 'Si es false, incluye inactivos (default: true)' })
  @SellerAccess()
  async findAll(@Query('activeOnly') activeOnly?: string) { return this.getPriceTiers.execute(activeOnly !== 'false'); }

  @Put(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Actualizar rango de precio', description: 'Modifica un rango de precio existente' })
  @ApiParam({ name: 'id', description: 'ID del rango de precio' })
  async update(@Param('id') id: string, @Body() dto: UpdatePriceTierDto) { return this.updatePriceTier.execute(id, dto); }
}
