import { Injectable, Inject } from '@nestjs/common';
import { IQuoteRepository, QUOTE_REPOSITORY } from '../../../domain/repositories/quote.repository';
import { QuoteStatus } from '../../../domain/entities/quote.entity';

@Injectable()
export class GetQuotesUseCase {
  constructor(
    @Inject(QUOTE_REPOSITORY) private readonly quoteRepository: IQuoteRepository,
  ) {}

  async execute(params: { status?: QuoteStatus; clientId?: string; startDate?: Date; endDate?: Date; page?: number; limit?: number } = {}) {
    const result = await this.quoteRepository.findAll(
      { status: params.status, clientId: params.clientId, startDate: params.startDate, endDate: params.endDate },
      params.page ?? 1,
      params.limit ?? 20,
    );
    // Mark expired quotes on-the-fly
    const now = new Date();
    result.data = result.data.map(q => {
      if (q.status === 'PENDING' && q.validUntil && new Date(q.validUntil) < now) {
        return { ...q, status: 'EXPIRED' as const };
      }
      return q;
    });
    return result;
  }

  async findById(id: string) {
    return this.quoteRepository.findById(id);
  }
}
