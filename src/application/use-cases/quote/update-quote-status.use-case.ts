import { Injectable, Inject, BadRequestException, NotFoundException } from '@nestjs/common';
import { IQuoteRepository, QUOTE_REPOSITORY } from '../../../domain/repositories/quote.repository';
import { QuoteStatus } from '../../../domain/entities/quote.entity';

@Injectable()
export class UpdateQuoteStatusUseCase {
  constructor(
    @Inject(QUOTE_REPOSITORY) private readonly quoteRepository: IQuoteRepository,
  ) {}

  async execute(id: string, status: QuoteStatus) {
    const quote = await this.quoteRepository.findById(id);
    if (!quote) throw new NotFoundException('Proforma no encontrada');
    if (quote.status === 'CONVERTED') throw new BadRequestException('No se puede modificar una proforma ya convertida en venta');
    return this.quoteRepository.updateStatus(id, status);
  }
}
