import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { GetStockByCompanyUseCase } from '../../application/use-cases/stock/get-stock-by-company.use-case';
import { TransferStockUseCase } from '../../application/use-cases/stock/transfer-stock.use-case';
import { GetLowStockAlertsUseCase } from '../../application/use-cases/stock/get-low-stock-alerts.use-case';
import { TransferStockDto } from '../../application/dtos/stock/transfer-stock.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../application/dtos/common/pagination.dto';

@ApiTags('Stock')
@ApiBearerAuth('JWT')
@Controller('stock')
export class StockController {
  constructor(
    private readonly getStockByCompany: GetStockByCompanyUseCase,
    private readonly transferStock: TransferStockUseCase,
    private readonly getLowStockAlerts: GetLowStockAlertsUseCase,
  ) {}

  @Get('company/:companyId')
  @ApiOperation({ summary: 'Stock por empresa', description: 'Obtiene el inventario paginado de una empresa especifica' })
  @ApiParam({ name: 'companyId', description: 'ID de la empresa' })
  async findByCompany(@Param('companyId') companyId: string, @Query() pagination: PaginationDto) { return this.getStockByCompany.execute(companyId, pagination.page, pagination.limit); }

  @Post('transfer')
  @ApiOperation({ summary: 'Transferir stock', description: 'Transfiere stock de un producto entre dos empresas' })
  async transfer(@Body() dto: TransferStockDto, @CurrentUser('id') userId: string) { return this.transferStock.execute(dto, userId); }

  @Get('alerts/:companyId')
  @ApiOperation({ summary: 'Alertas de stock bajo', description: 'Obtiene productos con stock por debajo del umbral indicado' })
  @ApiParam({ name: 'companyId', description: 'ID de la empresa' })
  @ApiQuery({ name: 'threshold', required: false, description: 'Umbral minimo (default: 10)' })
  async alerts(@Param('companyId') companyId: string, @Query('threshold') threshold?: number) { return this.getLowStockAlerts.execute(companyId, threshold || 10); }
}
