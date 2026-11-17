import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { ICashRegisterRepository, CASH_REGISTER_REPOSITORY } from '../../../domain/repositories/cash-register.repository';
import { ISaleRepository, SALE_REPOSITORY } from '../../../domain/repositories/sale.repository';
import { IStockRepository, STOCK_REPOSITORY } from '../../../domain/repositories/stock.repository';
import { IProductRepository, PRODUCT_REPOSITORY } from '../../../domain/repositories/product.repository';
import { ICreditAccountRepository, CREDIT_ACCOUNT_REPOSITORY } from '../../../domain/repositories/credit-account.repository';
import { StockMovementType } from '../../../domain/enums';
import { DeleteEntryDto } from '../../dtos/cash-register/delete-entry.dto';
import { RecordStockMovementUseCase } from '../stock-movement/record-stock-movement.use-case';
import { getNowInTimezone } from '../../../shared/utils/date.util';
import { BILLING_DOCUMENT_REPOSITORY, IBillingDocumentRepository } from '../../../domain/repositories/billing-document.repository';

@Injectable()
export class DeleteEntryUseCase {
  constructor(
    @Inject(CASH_REGISTER_REPOSITORY) private readonly cashRegisterRepository: ICashRegisterRepository,
    @Inject(SALE_REPOSITORY) private readonly saleRepository: ISaleRepository,
    @Inject(STOCK_REPOSITORY) private readonly stockRepository: IStockRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly productRepository: IProductRepository,
    @Inject(CREDIT_ACCOUNT_REPOSITORY) private readonly creditAccountRepository: ICreditAccountRepository,
    private readonly recordStockMovement: RecordStockMovementUseCase,
    @Inject(BILLING_DOCUMENT_REPOSITORY) private readonly billingDocuments: IBillingDocumentRepository,
  ) {}

  async execute(registerId: string, entryId: string, dto: DeleteEntryDto, userId?: string) {
    const register = await this.cashRegisterRepository.findById(registerId);
    if (!register) throw new BadRequestException('Caja registradora no encontrada');
    if (register.status === 'CLOSED') throw new BadRequestException('La caja está cerrada');

    const entry = register.entries.find(e => e.id === entryId);
    if (!entry) throw new BadRequestException('Movimiento no encontrado');
    if (entry.isDeleted) throw new BadRequestException('El movimiento ya fue eliminado');
    if (entry.referenceType === 'Sale' && entry.referenceId && await this.billingDocuments.hasSubmittedSale(entry.referenceId)) {
      throw new BadRequestException('La venta vinculada tiene un comprobante fiscal enviado. Revisa su situación antes de anular el movimiento');
    }

    // Soft-delete this entry
    await this.cashRegisterRepository.updateEntry(registerId, entryId, {
      isDeleted: true,
      deletedBy: userId,
      deletedAt: new Date(),
      deleteReason: dto.reason,
    });

    // If entry belongs to a sale, cancel the entire sale
    if (entry.referenceType === 'Sale' && entry.referenceId) {
      await this.cancelSaleFromCashEntry(entry.referenceId, registerId, dto.reason, userId);
    }

    return this.cashRegisterRepository.findById(registerId);
  }

  private async cancelSaleFromCashEntry(saleId: string, currentRegisterId: string, reason: string, userId?: string) {
    const sale = await this.saleRepository.findById(saleId);
    if (!sale || sale.isCancelled) return;

    // 1. Return stock for each item
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
        referenceType: 'SaleCancellation',
        description: `Anulación de venta: ${productLabel}`,
        userId,
        date: getNowInTimezone(),
      });
    }

    // 2. Soft-delete other cash entries of this sale (the triggering entry was already deleted)
    const allRegisters = await this.cashRegisterRepository.findAll({}, 1, 100);
    for (const reg of allRegisters.data) {
      for (const e of reg.entries) {
        if (e.referenceId === saleId && e.referenceType === 'Sale' && !e.isDeleted) {
          await this.cashRegisterRepository.updateEntry(reg.id!, e.id!, {
            isDeleted: true,
            deletedBy: userId,
            deletedAt: new Date(),
            deleteReason: `Anulación de venta: ${reason}`,
          });
        }
      }
    }

    // 3. Cancel credit account if applicable
    if (sale.isCredit) {
      const credit = await this.creditAccountRepository.findBySaleId(saleId);
      if (credit) {
        // Soft-delete cash entries from credit payments
        if (credit.payments && credit.payments.length > 0) {
          const cashEntryIds = credit.payments
            .map(p => p.cashRegisterEntryId)
            .filter(Boolean) as string[];

          if (cashEntryIds.length > 0) {
            const creditRegisters = await this.cashRegisterRepository.findAll({}, 1, 100);
            for (const reg of creditRegisters.data) {
              for (const e of reg.entries) {
                if (cashEntryIds.includes(e.id!) && !e.isDeleted) {
                  await this.cashRegisterRepository.updateEntry(reg.id!, e.id!, {
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

    // 4. Mark sale as cancelled
    await this.saleRepository.update(saleId, {
      isCancelled: true,
      cancelledBy: userId,
      cancelledAt: new Date(),
      cancelReason: `Eliminado desde caja: ${reason}`,
    });
  }
}
