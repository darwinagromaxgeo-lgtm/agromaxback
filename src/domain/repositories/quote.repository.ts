import { QuoteEntity, QuoteStatus } from '../entities/quote.entity';

export interface IQuoteRepository {
  create(quote: QuoteEntity): Promise<QuoteEntity>;
  findAll(filter?: { status?: QuoteStatus; clientId?: string; startDate?: Date; endDate?: Date }, page?: number, limit?: number): Promise<{ data: QuoteEntity[]; total: number }>;
  findById(id: string): Promise<QuoteEntity | null>;
  updateStatus(id: string, status: QuoteStatus, convertedSaleId?: string): Promise<QuoteEntity | null>;
  nextSequence(series: string): Promise<number>;
}

export const QUOTE_REPOSITORY = 'QUOTE_REPOSITORY';
