import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { ISaleRepository, SALE_REPOSITORY } from '../../../domain/repositories/sale.repository';
import { IStockRepository, STOCK_REPOSITORY } from '../../../domain/repositories/stock.repository';
import { IProductRepository, PRODUCT_REPOSITORY } from '../../../domain/repositories/product.repository';
import { IProductLotRepository, PRODUCT_LOT_REPOSITORY } from '../../../domain/repositories/product-lot.repository';
import { ICashRegisterRepository, CASH_REGISTER_REPOSITORY } from '../../../domain/repositories/cash-register.repository';
import { ICreditAccountRepository, CREDIT_ACCOUNT_REPOSITORY } from '../../../domain/repositories/credit-account.repository';
import { StockMovementType } from '../../../domain/enums';
import { RecordStockMovementUseCase } from '../stock-movement/record-stock-movement.use-case';
import { getNowInTimezone } from '../../../shared/utils/date.util';
import { BILLING_DOCUMENT_REPOSITORY, IBillingDocumentRepository } from '../../../domain/repositories/billing-document.repository';

@Injectable()
export class CancelSaleUseCase {
  constructor(
    @Inject(SALE_REPOSITORY) private readonly saleRepository: ISaleRepository,
    @Inject(STOCK_REPOSITORY) private readonly stockRepository: IStockRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly productRepository: IProductRepository,
    @Inject(PRODUCT_LOT_REPOSITORY) private readonly lotRepository: IProductLotRepository,
    @Inject(CASH_REGISTER_REPOSITORY) private readonly cashRegisterRepository: ICashRegisterRepository,
    @Inject(CREDIT_ACCOUNT_REPOSITORY) private readonly creditAccountRepository: ICreditAccountRepository,
    private readonly recordStockMovement: RecordStockMovementUseCase,
    @Inject(BILLING_DOCUMENT_REPOSITORY) private readonly billingDocuments: IBillingDocumentRepository,
  ) {}

  async execute(saleId: string, reason: string, userId?: string) {
    const sale = await this.saleRepository.findById(saleId);
    if (!sale) throw new BadRequestException('Venta no encontrada');
    if (sale.isCancelled) throw new BadRequestException('La venta ya fue anulada');
    if (await this.billingDocuments.hasSubmittedSale(saleId)) {
      throw new BadRequestException('La venta tiene un comprobante enviado, aceptado o pendiente de revisión. Debe resolverse su situación fiscal antes de anularla');
    }

    // 1. Devolver stock por cada item
    for (const item of sale.items) {
      const stock = await this.stockRepository.findByProductAndCompany(item.productId, item.companyId);
      const previousStock = stock?.quantity || 0;
      await this.stockRepository.upsert(item.productId, item.companyId, item.quantity);

      const product = await this.productRepository.findById(item.productId);
      const productLabel = `${product?.name || item.productId} x${item.quantity}`;

      if (product?.tracksLot) {
        const allLots = await this.lotRepository.findByProductAndCompany(item.productId, item.companyId, false);
        const reverseSorted = [...allLots].sort((a, b) => {
          if (!a.expirationDate && !b.expirationDate) return 0;
          if (!a.expirationDate) return 1;
          if (!b.expirationDate) return -1;
          return new Date(b.expirationDate).getTime() - new Date(a.expirationDate).getTime();
        });
        let remaining = item.quantity;
        for (const lot of reverseSorted) {
          if (remaining <= 0) break;
          const consumed = lot.initialQuantity - lot.currentQuantity;
          if (consumed <= 0) continue;
          const toRestore = Math.min(remaining, consumed);
          await this.lotRepository.restoreQuantity(lot.id!, toRestore);
          remaining -= toRestore;
        }
      }

      await this.recordStockMovement.execute({
        productId: item.productId,
        companyId: item.companyId,
        movementType: StockMovementType.ADJUSTMENT_IN,
        quantity: item.quantity,
        previousStock,
        newStock: previousStock + item.quantity,
        referenceId: sale.id,
        referenceType: 'SaleCancellation',
        description: `Anulación de venta: ${productLabel}`,
        userId,
        date: getNowInTimezone(),
      });
    }

    // 2. Soft-delete entradas de caja asociadas (si no es crédito)
    if (!sale.isCredit) {
      const allRegisters = await this.cashRegisterRepository.findAll({}, 1, 100);
      for (const register of allRegisters.data) {
        for (const entry of register.entries) {
          if (entry.referenceId === saleId && entry.referenceType === 'Sale' && !entry.isDeleted) {
            await this.cashRegisterRepository.updateEntry(register.id!, entry.id!, {
              isDeleted: true,
              deletedBy: userId,
              deletedAt: new Date(),
              deleteReason: `Anulación de venta: ${reason}`,
            });
          }
        }
      }
    }

    // 3. Anular cuenta por cobrar (si es crédito)
    if (sale.isCredit) {
      const credit = await this.creditAccountRepository.findBySaleId(saleId);
      if (credit) {
        // Soft-delete entradas de caja de pagos parciales del crédito
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
                    deleteReason: `Anulación de venta: ${reason}`,
                  });
                }
              }
            }
          }
        }

        if (credit.status !== 'PAID') {
          await this.creditAccountRepository.update(credit.id!, {
            status: 'PAID',
            paidAmount: credit.totalAmount,
            pendingAmount: 0,
          });
        }
      }
    }

    // 4. Marcar la venta como anulada
    return this.saleRepository.update(saleId, {
      isCancelled: true,
      cancelledBy: userId,
      cancelledAt: new Date(),
      cancelReason: reason,
    });
  }
}
