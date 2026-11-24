import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { ISaleRepository, SALE_REPOSITORY } from '../../../domain/repositories/sale.repository';
import { BILLING_DOCUMENT_REPOSITORY, IBillingDocumentRepository } from '../../../domain/repositories/billing-document.repository';

@Injectable()
export class CancelSaleUseCase {
  constructor(
    @Inject(SALE_REPOSITORY) private readonly sales: ISaleRepository,
    @Inject(BILLING_DOCUMENT_REPOSITORY) private readonly billing: IBillingDocumentRepository,
  ) {}

  async execute(saleId: string, reason: string, userId?: string) {
    const sale = await this.sales.findById(saleId);
    if (!sale) throw new BadRequestException('Venta no encontrada');
    if (sale.isCancelled) return sale;
    if (await this.billing.hasSubmittedSale(saleId)) throw new BadRequestException('La venta tiene un comprobante enviado, aceptado o pendiente de revisión. Debe resolverse su situación fiscal antes de anularla');
    return this.sales.cancel(saleId, reason, userId);
  }
}
