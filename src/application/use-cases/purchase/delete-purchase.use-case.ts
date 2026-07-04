import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IPurchaseRepository, PURCHASE_REPOSITORY } from '../../../domain/repositories/purchase.repository';
import { IStockRepository, STOCK_REPOSITORY } from '../../../domain/repositories/stock.repository';
import { IProductLotRepository, PRODUCT_LOT_REPOSITORY } from '../../../domain/repositories/product-lot.repository';
import { IAccountPayableRepository, ACCOUNT_PAYABLE_REPOSITORY } from '../../../domain/repositories/account-payable.repository';
import { IProductRepository, PRODUCT_REPOSITORY } from '../../../domain/repositories/product.repository';
import { StockMovementType } from '../../../domain/enums';
import { RecordStockMovementUseCase } from '../stock-movement/record-stock-movement.use-case';

type ReceivedItem = {
  productId: string;
  quantity: number;
  lotNumber?: string;
  isBonus: boolean;
};

@Injectable()
export class DeletePurchaseUseCase {
  constructor(
    @Inject(PURCHASE_REPOSITORY) private readonly purchaseRepository: IPurchaseRepository,
    @Inject(STOCK_REPOSITORY) private readonly stockRepository: IStockRepository,
    @Inject(PRODUCT_LOT_REPOSITORY) private readonly lotRepository: IProductLotRepository,
    @Inject(ACCOUNT_PAYABLE_REPOSITORY) private readonly apRepository: IAccountPayableRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly productRepository: IProductRepository,
    private readonly recordStockMovement: RecordStockMovementUseCase,
  ) {}

  async execute(purchaseId: string, userId?: string) {
    const purchase = await this.purchaseRepository.findById(purchaseId);
    if (!purchase) throw new NotFoundException('Compra no encontrada');

    const accountPayable = await this.apRepository.findByPurchaseId(purchaseId);
    if (accountPayable?.agreementId || accountPayable?.status === 'CONSOLIDATED') {
      throw new BadRequestException('La compra pertenece a un acuerdo de pago. Anula primero el acuerdo para poder eliminarla.');
    }

    const receivedItems: ReceivedItem[] = purchase.isHistorical
      ? []
      : [
          ...purchase.items.map(item => ({
            productId: item.productId,
            quantity: Math.max(0, item.receivedQty || 0),
            lotNumber: item.lotNumber,
            isBonus: false,
          })),
          ...(purchase.bonificationItems || []).map(item => ({
            productId: item.productId,
            quantity: Math.max(0, item.receivedQty || 0),
            lotNumber: item.lotNumber,
            isBonus: true,
          })),
        ].filter(item => item.quantity > 0);

    // Revertir primero los lotes. Un mismo lote puede agrupar ingresos de varias compras.
    for (const item of receivedItems.filter(item => item.lotNumber)) {
      const lot = await this.lotRepository.findByProductCompanyLot(
        item.productId,
        purchase.companyId,
        item.lotNumber!,
      );
      if (lot) await this.lotRepository.decrementToZero(lot.id!, item.quantity);
    }

    // Agrupar por producto para descontar el stock general una sola vez.
    const quantitiesByProduct = new Map<string, { regular: number; bonus: number }>();
    for (const item of receivedItems) {
      const totals = quantitiesByProduct.get(item.productId) || { regular: 0, bonus: 0 };
      if (item.isBonus) totals.bonus += item.quantity;
      else totals.regular += item.quantity;
      quantitiesByProduct.set(item.productId, totals);
    }

    for (const [productId, totals] of quantitiesByProduct) {
      const requestedQuantity = totals.regular + totals.bonus;
      const previous = await this.stockRepository.findByProductAndCompany(productId, purchase.companyId);
      const previousStock = Math.max(0, previous?.quantity || 0);
      const updated = await this.stockRepository.decrementToZero(productId, purchase.companyId, requestedQuantity);
      const newStock = Math.max(0, updated?.quantity || 0);
      const deductedQuantity = previousStock - newStock;

      if (deductedQuantity > 0) {
        const product = await this.productRepository.findById(productId);
        await this.recordStockMovement.execute({
          productId,
          companyId: purchase.companyId,
          movementType: StockMovementType.ADJUSTMENT_OUT,
          quantity: deductedQuantity,
          previousStock,
          newStock,
          referenceId: purchaseId,
          referenceType: 'PurchaseDeletion',
          description: `Eliminación de compra ${purchase.supplier}: ${product?.name || productId} x${deductedQuantity}`,
          userId,
          date: new Date(),
        });
      }
    }

    if (accountPayable?.id) await this.apRepository.delete(accountPayable.id);
    await this.purchaseRepository.delete(purchaseId);

    return {
      message: 'Compra eliminada correctamente',
      stockProductsAffected: quantitiesByProduct.size,
      accountPayableDeleted: !!accountPayable,
    };
  }
}
