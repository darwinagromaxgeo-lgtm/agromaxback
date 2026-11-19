import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BILLING_DOCUMENT_REPOSITORY } from '../domain/repositories/billing-document.repository';
import { MongoBillingDocumentRepository } from '../infrastructure/database/mongodb/repositories/mongo-billing-document.repository';
import { BillingCounter, BillingCounterSchema, BillingDocument, BillingDocumentSchema } from '../infrastructure/database/mongodb/schemas/billing-document.schema';
import { BillingCreditNote, BillingCreditNoteSchema } from '../infrastructure/database/mongodb/schemas/billing-credit-note.schema';
import { BILLING_CREDIT_NOTE_REPOSITORY } from '../domain/repositories/billing-credit-note.repository';
import { MongoBillingCreditNoteRepository } from '../infrastructure/database/mongodb/repositories/mongo-billing-credit-note.repository';

@Module({
  imports: [MongooseModule.forFeature([
    { name: BillingDocument.name, schema: BillingDocumentSchema },
    { name: BillingCounter.name, schema: BillingCounterSchema },
    { name: BillingCreditNote.name, schema: BillingCreditNoteSchema },
  ])],
  providers: [{ provide: BILLING_DOCUMENT_REPOSITORY, useClass: MongoBillingDocumentRepository }, { provide:BILLING_CREDIT_NOTE_REPOSITORY, useClass:MongoBillingCreditNoteRepository }],
  exports: [BILLING_DOCUMENT_REPOSITORY, BILLING_CREDIT_NOTE_REPOSITORY],
})
export class BillingPersistenceModule {}
