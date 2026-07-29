import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QuoteDocument, QuoteSchema, QuoteCounterDocument, QuoteCounterSchema } from '../infrastructure/database/mongodb/schemas/quote.schema';
import { MongoQuoteRepository } from '../infrastructure/database/mongodb/repositories/mongo-quote.repository';
import { QUOTE_REPOSITORY } from '../domain/repositories/quote.repository';
import { CreateQuoteUseCase } from '../application/use-cases/quote/create-quote.use-case';
import { GetQuotesUseCase } from '../application/use-cases/quote/get-quotes.use-case';
import { UpdateQuoteStatusUseCase } from '../application/use-cases/quote/update-quote-status.use-case';
import { ConvertQuoteToSaleUseCase } from '../application/use-cases/quote/convert-quote-to-sale.use-case';
import { QuoteController } from '../presentation/controllers/quote.controller';
import { SaleModule } from './sale.module';
import { ClientModule } from './client.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: QuoteDocument.name, schema: QuoteSchema },
      { name: QuoteCounterDocument.name, schema: QuoteCounterSchema },
    ]),
    SaleModule,
    ClientModule,
  ],
  controllers: [QuoteController],
  providers: [
    { provide: QUOTE_REPOSITORY, useClass: MongoQuoteRepository },
    CreateQuoteUseCase,
    GetQuotesUseCase,
    UpdateQuoteStatusUseCase,
    ConvertQuoteToSaleUseCase,
  ],
  exports: [QUOTE_REPOSITORY],
})
export class QuoteModule {}
