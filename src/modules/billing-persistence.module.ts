import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BILLING_DOCUMENT_REPOSITORY } from '../domain/repositories/billing-document.repository';
import { MongoBillingDocumentRepository } from '../infrastructure/database/mongodb/repositories/mongo-billing-document.repository';
import { BillingCounter, BillingCounterSchema, BillingDocument, BillingDocumentSchema } from '../infrastructure/database/mongodb/schemas/billing-document.schema';

@Module({
  imports: [MongooseModule.forFeature([
    { name: BillingDocument.name, schema: BillingDocumentSchema },
    { name: BillingCounter.name, schema: BillingCounterSchema },
  ])],
  providers: [{ provide: BILLING_DOCUMENT_REPOSITORY, useClass: MongoBillingDocumentRepository }],
  exports: [BILLING_DOCUMENT_REPOSITORY],
})
export class BillingPersistenceModule {}
