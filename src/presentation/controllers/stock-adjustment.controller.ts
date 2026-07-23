import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { BranchScoped } from '../../common/decorators/branch-scoped.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CreateStockAdjustmentUseCase } from '../../application/use-cases/stock-adjustment/create-stock-adjustment.use-case';
import { GetStockAdjustmentsUseCase } from '../../application/use-cases/stock-adjustment/get-stock-adjustments.use-case';
import { CreateStockAdjustmentDto } from '../../application/dtos/stock-adjustment/create-stock-adjustment.dto';
import { FilterStockAdjustmentDto } from '../../application/dtos/stock-adjustment/filter-stock-adjustment.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Stock Adjustments')
@ApiBearerAuth('JWT')
@Controller('stock-adjustments')
@BranchScoped()
export class StockAdjustmentController {
  constructor(
    private readonly createAdjustment: CreateStockAdjustmentUseCase,
    private readonly getAdjustments: GetStockAdjustmentsUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crear ajuste de stock', description: 'Registra un ajuste manual de inventario (incremento o decremento) con trazabilidad' })
  async create(@Body() dto: CreateStockAdjustmentDto, @CurrentUser('id') userId: string) { return this.createAdjustment.execute(dto, userId); }

  @Get()
  @ApiOperation({ summary: 'Listar ajustes de stock', description: 'Obtiene historial de ajustes con filtros por producto, empresa y rango de fechas' })
  async findAll(@Query() filter: FilterStockAdjustmentDto) { return this.getAdjustments.execute(filter); }
}
