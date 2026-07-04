import { Injectable, Inject, BadRequestException, NotFoundException } from '@nestjs/common';
import { IQuoteRepository, QUOTE_REPOSITORY } from '../../../domain/repositories/quote.repository';
import { CreateSaleUseCase } from '../sale/create-sale.use-case';
import { CreateSaleDto } from '../../dtos/sale/create-sale.dto';

@Injectable()
export class ConvertQuoteToSaleUseCase {
  constructor(
    @Inject(QUOTE_REPOSITORY) private readonly quoteRepository: IQuoteRepository,
    private readonly createSale: CreateSaleUseCase,
  ) {}

  async execute(quoteId: string, saleDto: Omit<CreateSaleDto, 'items'>, userId?: string) {
    const quote = await this.quoteRepository.findById(quoteId);
    if (!quote) throw new NotFoundException('Proforma no encontrada');
    if (quote.status === 'CONVERTED') throw new BadRequestException('Esta proforma ya fue convertida en venta');
    if (quote.status === 'REJECTED') throw new BadRequestException('Esta proforma fue rechazada');

    const sale = await this.createSale.execute({
      ...saleDto,
      clientId: saleDto.clientId || quote.clientId,
      items: quote.items.map(i => ({
        productId: i.productId,
        companyId: i.companyId,
        quantity: i.quantity,
        priceTier: i.priceTier,
        unitPrice: i.unitPrice,
      })),
    } as CreateSaleDto, userId);

    await this.quoteRepository.updateStatus(quoteId, 'CONVERTED', sale.id);
    return sale;
  }
}
