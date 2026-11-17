import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { ICreditAccountRepository, CREDIT_ACCOUNT_REPOSITORY } from '../../../domain/repositories/credit-account.repository';
import { ISaleRepository, SALE_REPOSITORY } from '../../../domain/repositories/sale.repository';
import { IStockRepository, STOCK_REPOSITORY } from '../../../domain/repositories/stock.repository';
import { IProductRepository, PRODUCT_REPOSITORY } from '../../../domain/repositories/product.repository';
import { ICashRegisterRepository, CASH_REGISTER_REPOSITORY } from '../../../domain/repositories/cash-register.repository';
import { StockMovementType } from '../../../domain/enums';
import { RecordStockMovementUseCase } from '../stock-movement/record-stock-movement.use-case';
import { getNowInTimezone } from '../../../shared/utils/date.util';
import { BILLING_DOCUMENT_REPOSITORY, IBillingDocumentRepository } from '../../../domain/repositories/billing-document.repository';

@Injectable()
export class DeleteCreditUseCase {
  constructor(
    @Inject(CREDIT_ACCOUNT_REPOSITORY) private readonly creditRepository: ICreditAccountRepository,
    @Inject(SALE_REPOSITORY) private readonly saleRepository: ISaleRepository,
    @Inject(STOCK_REPOSITORY) private readonly stockRepository: IStockRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly productRepository: IProductRepository,
    @Inject(CASH_REGISTER_REPOSITORY) private readonly cashRegisterRepository: ICashRegisterRepository,
    private readonly recordStockMovement: RecordStockMovementUseCase,
    @Inject(BILLING_DOCUMENT_REPOSITORY) private readonly billingDocuments: IBillingDocumentRepository,
  ) {}

  async execute(id: string, userId?: string) {
    const credit = await this.creditRepository.findById(id);
    if (!credit) throw new BadRequestException('Crédito no encontrado');
    for (const saleId of credit.saleIds || []) {
      if (await this.billingDocuments.hasSubmittedSale(saleId)) throw new BadRequestException('Una venta de la cuenta tiene un comprobante fiscal enviado. Resuelve su situación antes de eliminar el crédito');
    }

    // 1. Anular todas las ventas asociadas (devolver stock)
    for (const saleId of credit.saleIds || []) {
      const sale = await this.saleRepository.findById(saleId);
      if (!sale || sale.isCancelled) continue;

      for (const item of sale.items) {
        const stock = await this.stockRepository.findByProductAndCompany(item.productId, item.companyId);
        const previousStock = stock?.quantity || 0;
        await this.stockRepository.upsert(item.productId, item.companyId, item.quantity);

        const product = await this.productRepository.findById(item.productId);
        const productLabel = `${product?.name || item.productId} x${item.quantity}`;

        await this.recordStockMovement.execute({
          productId: item.productId,
          companyId: item.companyId,
          movementType: StockMovementType.ADJUSTMENT_IN,
          quantity: item.quantity,
          previousStock,
          newStock: previousStock + item.quantity,
          referenceId: sale.id,
          referenceType: 'CreditDeletion',
          description: `Eliminación de crédito: ${productLabel}`,
          userId,
          date: getNowInTimezone(),
        });
      }

      await this.saleRepository.update(saleId, {
        isCancelled: true,
        cancelledBy: userId,
        cancelledAt: new Date(),
        cancelReason: 'Crédito eliminado',
      });
    }

    // 2. Soft-delete entradas de caja asociadas a pagos de este crédito
    if (credit.payments && credit.payments.length > 0) {
      const cashEntryIds = credit.payments
        .map(p => p.cashRegisterEntryId)
        .filter(Boolean) as string[];

      if (cashEntryIds.length > 0) {
        const allRegisters = await this.cashRegisterRepository.findAll({}, 1, 100);
        for (const register of allRegisters.data) {
          for (const entry of register.entries) {
            if (cashEntryIds.includes(entry.id!) && !entry.isDeleted) {
              await this.cashRegisterRepository.updateEntry(register.id!, entry.id!, {
                isDeleted: true,
                deletedBy: userId,
                deletedAt: new Date(),
                deleteReason: 'Eliminación de crédito',
              });
            }
          }
        }
      }
    }

    // 3. Eliminar el crédito
    const deleted = await this.creditRepository.delete(id);
    if (!deleted) throw new BadRequestException('No se pudo eliminar el crédito');

    return { message: 'Crédito eliminado correctamente' };
  }
}
