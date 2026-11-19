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
import { BillingCreditNoteService } from '../application/services/billing-credit-note.service';
import { BillingCreditNoteController } from '../presentation/controllers/billing-credit-note.controller';

@Module({
  imports: [BillingPersistenceModule, SaleModule, CompanyModule, ClientModule, ProductModule],
  providers: [BillingService, BillingCreditNoteService, { provide: BILLING_PROVIDER, useClass: GreenterBillingProvider }],
  controllers: [BillingController, BillingCreditNoteController],
})
export class BillingModule {}
