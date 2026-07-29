import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { IQuoteRepository, QUOTE_REPOSITORY } from '../../../domain/repositories/quote.repository';
import { CreateQuoteDto } from '../../dtos/quote/create-quote.dto';
import { getNowInTimezone } from '../../../shared/utils/date.util';
import { CLIENT_REPOSITORY, IClientRepository } from '../../../domain/repositories/client.repository';

@Injectable()
export class CreateQuoteUseCase {
  constructor(
    @Inject(QUOTE_REPOSITORY) private readonly quoteRepository: IQuoteRepository,
    @Inject(CLIENT_REPOSITORY) private readonly clientRepository: IClientRepository,
  ) {}

  async execute(dto: CreateQuoteDto, userId?: string, branchId?: string) {
    if (!branchId) throw new BadRequestException('Selecciona una sucursal para crear la cotización');
    if (dto.clientId) {
      const client = await this.clientRepository.findById(dto.clientId);
      if (!client || client.branchId !== branchId) {
        throw new BadRequestException('El cliente no pertenece a la sucursal activa');
      }
    }
    const issueDate = dto.issueDate ? new Date(dto.issueDate) : getNowInTimezone();
    const validUntil = dto.validUntil ? new Date(dto.validUntil) : new Date(issueDate.getTime() + 15 * 24 * 60 * 60 * 1000);

    const items = dto.items.map(i => ({
      productId: i.productId,
      companyId: i.companyId,
      quantity: i.quantity,
      priceTier: i.priceTier,
      unitPrice: i.unitPrice,
      subtotal: Math.round(i.quantity * i.unitPrice * 100) / 100,
    }));
    const total = Math.round(items.reduce((s, i) => s + i.subtotal, 0) * 100) / 100;

    const series = dto.series || 'P001';
    const number = await this.quoteRepository.nextSequence(series, branchId);
    const quoteNumber = `${series}-${String(number).padStart(8, '0')}`;

    return this.quoteRepository.create({
      series,
      number,
      quoteNumber,
      companyId: dto.companyId,
      clientId: dto.clientId,
      clientName: dto.clientName,
      items,
      total,
      notes: dto.notes,
      status: 'PENDING',
      issueDate,
      validUntil,
      createdBy: userId,
      branchId,
    });
  }
}
