import { AccountingRead } from '../../common/decorators/accounting-access.decorator';
import { Controller, Get, Query } from '@nestjs/common';
import { BranchScoped } from '../../common/decorators/branch-scoped.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { GetStockMovementsUseCase } from '../../application/use-cases/stock-movement/get-stock-movements.use-case';
import { FilterStockMovementDto } from '../../application/dtos/stock-movement/filter-stock-movement.dto';

@ApiTags('Kardex')
@ApiBearerAuth('JWT')
@AccountingRead()
@Controller('stock-movements')
@BranchScoped()
export class StockMovementController {
  constructor(
    private readonly getStockMovements: GetStockMovementsUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Kardex - Listar movimientos de stock',
    description: 'Obtiene el historial completo de movimientos de inventario con filtros por producto, empresa, tipo y rango de fechas',
  })
  async findAll(@Query() filter: FilterStockMovementDto) {
    return this.getStockMovements.execute(filter);
  }
}
