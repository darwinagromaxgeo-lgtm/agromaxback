import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { BranchScoped } from '../../common/decorators/branch-scoped.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CreateStockAdjustmentUseCase } from '../../application/use-cases/stock-adjustment/create-stock-adjustment.use-case';
import { GetStockAdjustmentsUseCase } from '../../application/use-cases/stock-adjustment/get-stock-adjustments.use-case';
import { CreateStockAdjustmentDto } from '../../application/dtos/stock-adjustment/create-stock-adjustment.dto';
import { FilterStockAdjustmentDto } from '../../application/dtos/stock-adjustment/filter-stock-adjustment.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentBranch } from '../../common/decorators/current-branch.decorator';
import { CreateStockAdjustmentBatchDto } from '../../application/dtos/stock-adjustment/create-stock-adjustment-batch.dto';

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
  @ApiOperation({ summary: 'Crear ajuste de stock', description: 'Suma, resta o establece una cantidad final con trazabilidad' })
  async create(@Body() dto: CreateStockAdjustmentDto, @CurrentUser('id') userId: string, @CurrentBranch('id') branchId: string) { return this.createAdjustment.execute(dto, branchId, userId); }

  @Post('batch')
  @ApiOperation({ summary: 'Ajustar varios productos', description: 'Guarda todos los ajustes y sus lotes en una transacción. Detecta cambios de stock y evita duplicar reintentos.' })
  async createBatch(@Body() dto: CreateStockAdjustmentBatchDto, @CurrentUser('id') userId: string, @CurrentBranch('id') branchId: string) { return this.createAdjustment.executeBatch(dto, branchId, userId); }

  @Get()
  @ApiOperation({ summary: 'Listar ajustes de stock', description: 'Obtiene historial de ajustes con filtros por producto, empresa y rango de fechas' })
  async findAll(@Query() filter: FilterStockAdjustmentDto) { return this.getAdjustments.execute(filter); }
}
