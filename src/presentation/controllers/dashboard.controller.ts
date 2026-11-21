import { AccountingRead } from '../../common/decorators/accounting-access.decorator';
import { Controller, Get, Query } from '@nestjs/common';
import { BranchScoped } from '../../common/decorators/branch-scoped.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { GetDailySummaryUseCase } from '../../application/use-cases/dashboard/get-daily-summary.use-case';
import { GetProfitabilityUseCase } from '../../application/use-cases/dashboard/get-profitability.use-case';
import { GetCreditSummaryUseCase } from '../../application/use-cases/dashboard/get-credit-summary.use-case';
import { GetSalesChartUseCase } from '../../application/use-cases/dashboard/get-sales-chart.use-case';
import { GetCategorySalesUseCase } from '../../application/use-cases/dashboard/get-category-sales.use-case';
import { GetTopSuppliersUseCase } from '../../application/use-cases/dashboard/get-top-suppliers.use-case';
import { GetCategorySalesChartUseCase } from '../../application/use-cases/dashboard/get-category-sales-chart.use-case';
import { GetExchangeRateUseCase } from '../../application/use-cases/dashboard/get-exchange-rate.use-case';
import { GetPurchaseByCategoryUseCase } from '../../application/use-cases/dashboard/get-purchase-by-category.use-case';
import { GetFinancialOverviewUseCase } from '../../application/use-cases/dashboard/get-financial-overview.use-case';
import { GetCategoryPurchaseChartUseCase } from '../../application/use-cases/dashboard/get-category-purchase-chart.use-case';
import { GetSubcategorySalesChartUseCase } from '../../application/use-cases/dashboard/get-subcategory-sales-chart.use-case';
import { GetSubcategoryPurchaseChartUseCase } from '../../application/use-cases/dashboard/get-subcategory-purchase-chart.use-case';

@ApiTags('Dashboard')
@ApiBearerAuth('JWT')
@AccountingRead()
@Controller('dashboard')
@BranchScoped()
export class DashboardController {
  constructor(
    private readonly getDailySummary: GetDailySummaryUseCase,
    private readonly getProfitability: GetProfitabilityUseCase,
    private readonly getCreditSummary: GetCreditSummaryUseCase,
    private readonly getSalesChart: GetSalesChartUseCase,
    private readonly getCategorySales: GetCategorySalesUseCase,
    private readonly getTopSuppliers: GetTopSuppliersUseCase,
    private readonly getCategorySalesChart: GetCategorySalesChartUseCase,
    private readonly getExchangeRate: GetExchangeRateUseCase,
    private readonly getPurchaseByCategory: GetPurchaseByCategoryUseCase,
    private readonly getFinancialOverview: GetFinancialOverviewUseCase,
    private readonly getCategoryPurchaseChart: GetCategoryPurchaseChartUseCase,
    private readonly getSubcategorySalesChart: GetSubcategorySalesChartUseCase,
    private readonly getSubcategoryPurchaseChart: GetSubcategoryPurchaseChartUseCase,
  ) {}

  @Get('summary')
  @ApiOperation({ summary: 'Resumen financiero', description: 'Obtiene ingresos, egresos y ganancia neta del periodo seleccionado (diario/semanal/mensual)' })
  @ApiQuery({ name: 'period', required: false, enum: ['daily', 'weekly', 'monthly'], description: 'Periodo del resumen (default: daily)' })
  async summary(@Query('period') period?: string) { return this.getDailySummary.execute(period || 'daily'); }

  @Get('profitability')
  @ApiOperation({ summary: 'Rentabilidad por producto', description: 'Obtiene los productos mas vendidos del ultimo mes con ingresos totales y unidades vendidas' })
  async profitability() { return this.getProfitability.execute(); }

  @Get('credits-summary')
  @ApiOperation({ summary: 'Resumen de creditos', description: 'Obtiene total de creditos pendientes, activos, y los top 10 deudores' })
  async creditsSummary() { return this.getCreditSummary.execute(); }

  @Get('sales-chart')
  @ApiOperation({ summary: 'Datos para graficos de ventas', description: 'Retorna ventas diarias, ventas por hora y desglose efectivo vs credito' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Fecha inicio (ISO)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'Fecha fin (ISO)' })
  async salesChart(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.getSalesChart.execute(
      startDate ? new Date(startDate) : undefined,
      endDate ? toEndOfDay(endDate) : undefined,
    );
  }

  @Get('category-sales-chart')
  @ApiOperation({ summary: 'Ventas diarias por categoria', description: 'Retorna ventas diarias desglosadas por categoria para grafico de lineas' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Fecha inicio (ISO)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'Fecha fin (ISO)' })
  async categorySalesChart(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.getCategorySalesChart.execute(
      startDate ? new Date(startDate) : undefined,
      endDate ? toEndOfDay(endDate) : undefined,
    );
  }

  @Get('category-sales')
  @ApiOperation({ summary: 'Ventas por categoria', description: 'Agrega ventas por categoria de producto en el rango de fechas indicado' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Fecha inicio (ISO)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'Fecha fin (ISO)' })
  async categorySales(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.getCategorySales.execute(
      startDate ? new Date(startDate) : undefined,
      endDate ? toEndOfDay(endDate) : undefined,
    );
  }

  @Get('top-suppliers')
  @ApiOperation({ summary: 'Top proveedores por compras', description: 'Lista los proveedores con mayor monto de compras en el rango de fechas indicado' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Fecha inicio (ISO)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'Fecha fin (ISO)' })
  async topSuppliers(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.getTopSuppliers.execute(
      startDate ? new Date(startDate) : undefined,
      endDate ? toEndOfDay(endDate) : undefined,
    );
  }

  @Get('category-purchase-chart')
  @ApiOperation({ summary: 'Compras diarias por categoría', description: 'Retorna compras diarias desglosadas por categoría para gráfico de área' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async categoryPurchaseChart(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.getCategoryPurchaseChart.execute(
      startDate ? new Date(startDate) : undefined,
      endDate ? toEndOfDay(endDate) : undefined,
    );
  }

  @Get('purchase-by-category')
  @ApiOperation({ summary: 'Compras por categoría', description: 'Agrega compras por categoría de producto en el rango de fechas indicado' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async purchaseByCategory(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.getPurchaseByCategory.execute(
      startDate ? new Date(startDate) : undefined,
      endDate ? toEndOfDay(endDate) : undefined,
    );
  }

  @Get('subcategory-sales-chart')
  @ApiOperation({ summary: 'Ventas diarias por subcategoría', description: 'Retorna ventas diarias desglosadas por subcategoría de una categoría padre' })
  @ApiQuery({ name: 'categoryId', required: true, description: 'ID de la categoría padre' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async subcategorySalesChart(
    @Query('categoryId') categoryId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.getSubcategorySalesChart.execute(
      categoryId,
      startDate ? new Date(startDate) : undefined,
      endDate ? toEndOfDay(endDate) : undefined,
    );
  }

  @Get('subcategory-purchase-chart')
  @ApiOperation({ summary: 'Compras diarias por subcategoría', description: 'Retorna compras diarias desglosadas por subcategoría de una categoría padre' })
  @ApiQuery({ name: 'categoryId', required: true })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async subcategoryPurchaseChart(
    @Query('categoryId') categoryId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.getSubcategoryPurchaseChart.execute(
      categoryId,
      startDate ? new Date(startDate) : undefined,
      endDate ? toEndOfDay(endDate) : undefined,
    );
  }

  @Get('financial-overview')
  @ApiOperation({ summary: 'Vista financiera general', description: 'Ingresos mensuales, cuentas por pagar, valor de stock y créditos pendientes' })
  async financialOverview() {
    return this.getFinancialOverview.execute();
  }

  @Get('exchange-rate')
  @ApiOperation({ summary: 'Tipo de cambio USD/PEN', description: 'Retorna el histórico de tipo de cambio de los últimos 7, 15 o 30 días desde la API de Decolecta' })
  @ApiQuery({ name: 'days', required: false, description: 'Número de días (7, 15 o 30). Default: 7' })
  async exchangeRate(@Query('days') days?: string) {
    return this.getExchangeRate.execute(days ? parseInt(days, 10) : 7);
  }
}

function toEndOfDay(dateStr: string): Date {
  const d = new Date(dateStr);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}
