import { Module } from '@nestjs/common';
import { BillingService } from '../application/services/billing.service';
import { BILLING_PROVIDER } from '../domain/repositories/billing-provider';
import { GreenterBillingProvider } from '../infrastructure/billing/greenter-billing.provider';
import { BillingController } from '../presentation/controllers/billing.controller';
import { BillingPersistenceModule } from './billing-persistence.module';
import { SaleModule } from './sale.module';
import { CompanyModule } from './company.module';
import { ClientModule } from './client.module';
import { ProductModule } from './product.module';

@Module({
  imports: [BillingPersistenceModule, SaleModule, CompanyModule, ClientModule, ProductModule],
  providers: [BillingService, { provide: BILLING_PROVIDER, useClass: GreenterBillingProvider }],
  controllers: [BillingController],
})
export class BillingModule {}
