import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import databaseConfig from './infrastructure/config/database.config';
import appConfig from './infrastructure/config/app.config';
import { AuthModule } from './modules/auth.module';
import { ProductModule } from './modules/product.module';
import { CompanyModule } from './modules/company.module';
import { PriceTierModule } from './modules/price-tier.module';
import { StockModule } from './modules/stock.module';
import { PurchaseModule } from './modules/purchase.module';
import { SaleModule } from './modules/sale.module';
import { ClientModule } from './modules/client.module';
import { StockAdjustmentModule } from './modules/stock-adjustment.module';
import { CashRegisterModule } from './modules/cash-register.module';
import { CreditAccountModule } from './modules/credit-account.module';
import { DashboardModule } from './modules/dashboard.module';
import { CategoryModule } from './modules/category.module';
import { UnitModule } from './modules/unit.module';
import { UserModule } from './modules/user.module';
import { StockMovementModule } from './modules/stock-movement.module';
import { LoanModule } from './modules/loan.module';
import { PaymentMethodModule } from './modules/payment-method.module';
import { AccountPayableModule } from './modules/account-payable.module';
import { PaymentAgreementsModule } from './modules/payment-agreements.module';
import { LookupModule } from './modules/lookup.module';
import { SupplierModule } from './modules/supplier.module';
import { ProductLotModule } from './modules/product-lot.module';
import { QuoteModule } from './modules/quote.module';
import { JwtAuthGuard } from './presentation/guards/jwt-auth.guard';
import { RolesGuard } from './presentation/guards/roles.guard';
import { HttpExceptionFilter } from './presentation/filters/http-exception.filter';
import { ResponseTransformInterceptor } from './presentation/interceptors/response-transform.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [databaseConfig, appConfig] }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({ uri: configService.get<string>('database.uri') }),
      inject: [ConfigService],
    }),
    AuthModule, CompanyModule, CategoryModule, UnitModule, PriceTierModule, ProductModule, StockModule, PurchaseModule, SaleModule, ClientModule,
    StockAdjustmentModule, CashRegisterModule, CreditAccountModule, DashboardModule, UserModule, StockMovementModule, LoanModule, PaymentMethodModule, AccountPayableModule,
    LookupModule, SupplierModule, ProductLotModule, QuoteModule, PaymentAgreementsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseTransformInterceptor },
  ],
})
export class AppModule {}
