import { Module } from '@nestjs/common';
import { GetDailySummaryUseCase } from '../application/use-cases/dashboard/get-daily-summary.use-case';
import { GetProfitabilityUseCase } from '../application/use-cases/dashboard/get-profitability.use-case';
import { GetCreditSummaryUseCase } from '../application/use-cases/dashboard/get-credit-summary.use-case';
import { GetSalesChartUseCase } from '../application/use-cases/dashboard/get-sales-chart.use-case';
import { GetCategorySalesUseCase } from '../application/use-cases/dashboard/get-category-sales.use-case';
import { GetTopSuppliersUseCase } from '../application/use-cases/dashboard/get-top-suppliers.use-case';
import { GetCategorySalesChartUseCase } from '../application/use-cases/dashboard/get-category-sales-chart.use-case';
import { GetExchangeRateUseCase } from '../application/use-cases/dashboard/get-exchange-rate.use-case';
import { GetPurchaseByCategoryUseCase } from '../application/use-cases/dashboard/get-purchase-by-category.use-case';
import { GetFinancialOverviewUseCase } from '../application/use-cases/dashboard/get-financial-overview.use-case';
import { GetCategoryPurchaseChartUseCase } from '../application/use-cases/dashboard/get-category-purchase-chart.use-case';
import { GetSubcategorySalesChartUseCase } from '../application/use-cases/dashboard/get-subcategory-sales-chart.use-case';
import { GetSubcategoryPurchaseChartUseCase } from '../application/use-cases/dashboard/get-subcategory-purchase-chart.use-case';
import { DashboardController } from '../presentation/controllers/dashboard.controller';
import { CashRegisterModule } from './cash-register.module';
import { SaleModule } from './sale.module';
import { CreditAccountModule } from './credit-account.module';
import { ProductModule } from './product.module';
import { CategoryModule } from './category.module';
import { PurchaseModule } from './purchase.module';
import { StockModule } from './stock.module';
import { AccountPayableModule } from './account-payable.module';
import { ProductLotModule } from './product-lot.module';

@Module({
  imports: [
    CashRegisterModule,
    SaleModule,
    CreditAccountModule,
    ProductModule,
    CategoryModule,
    PurchaseModule,
    StockModule,
    AccountPayableModule,
    ProductLotModule,
  ],
  controllers: [DashboardController],
  providers: [
    GetDailySummaryUseCase,
    GetProfitabilityUseCase,
    GetCreditSummaryUseCase,
    GetSalesChartUseCase,
    GetCategorySalesUseCase,
    GetTopSuppliersUseCase,
    GetCategorySalesChartUseCase,
    GetExchangeRateUseCase,
    GetPurchaseByCategoryUseCase,
    GetFinancialOverviewUseCase,
    GetCategoryPurchaseChartUseCase,
    GetSubcategorySalesChartUseCase,
    GetSubcategoryPurchaseChartUseCase,
  ],
})
export class DashboardModule {}
