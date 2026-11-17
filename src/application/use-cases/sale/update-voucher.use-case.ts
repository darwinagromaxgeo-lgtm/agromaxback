import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { ISaleRepository, SALE_REPOSITORY } from '../../../domain/repositories/sale.repository';
import { BILLING_DOCUMENT_REPOSITORY, IBillingDocumentRepository } from '../../../domain/repositories/billing-document.repository';

@Injectable()
export class UpdateVoucherUseCase {
  constructor(
    @Inject(SALE_REPOSITORY) private readonly saleRepository: ISaleRepository,
    @Inject(BILLING_DOCUMENT_REPOSITORY) private readonly billingDocuments: IBillingDocumentRepository,
  ) {}

  async execute(saleId: string, voucherType: string) {
    const sale = await this.saleRepository.findById(saleId);
    if (!sale) {
      throw new NotFoundException('Venta no encontrada');
    }
    if (sale.isCancelled) {
      throw new BadRequestException('No se puede modificar una venta anulada');
    }
    if (sale.voucherType === voucherType) return sale;
    if (await this.billingDocuments.hasActiveSale(saleId)) {
      throw new BadRequestException('La venta ya tiene un comprobante asociado. Su tipo se conserva; revisa el comprobante en Facturación.');
    }
    return this.saleRepository.update(saleId, { voucherType });
  }
}
