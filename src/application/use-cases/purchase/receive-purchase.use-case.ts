import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { IPurchaseRepository, PURCHASE_REPOSITORY } from '../../../domain/repositories/purchase.repository';
import { IStockRepository, STOCK_REPOSITORY } from '../../../domain/repositories/stock.repository';
import { IProductRepository, PRODUCT_REPOSITORY } from '../../../domain/repositories/product.repository';
import { StockMovementType } from '../../../domain/enums';
import { RecordStockMovementUseCase } from '../stock-movement/record-stock-movement.use-case';
import { UpsertProductLotUseCase } from '../product-lot/upsert-product-lot.use-case';

export interface ReceiveItemInput {
  productId: string;
  quantity: number;
}

export interface RegisterReceptionInput {
  items: ReceiveItemInput[];
  notes?: string;
  userId?: string;
}

@Injectable()
export class ReceivePurchaseUseCase {
  constructor(
    @Inject(PURCHASE_REPOSITORY) private readonly purchaseRepository: IPurchaseRepository,
    @Inject(STOCK_REPOSITORY) private readonly stockRepository: IStockRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly productRepository: IProductRepository,
    private readonly recordStockMovement: RecordStockMovementUseCase,
    private readonly upsertProductLot: UpsertProductLotUseCase,
  ) {}

  async execute(purchaseId: string, input: RegisterReceptionInput) {
    const purchase = await this.purchaseRepository.findById(purchaseId);
    if (!purchase) throw new NotFoundException('Compra no encontrada');
    if (purchase.receptionStatus === 'RECEIVED') throw new BadRequestException('Esta compra ya fue recibida completamente');

    for (const inputItem of input.items) {
      const purchaseItem = purchase.items.find(i => i.productId === inputItem.productId);
      if (!purchaseItem) throw new BadRequestException(`Producto ${inputItem.productId} no pertenece a esta compra`);

      const alreadyReceived = purchaseItem.receivedQty || 0;
      const pending = purchaseItem.quantity - alreadyReceived;
      if (inputItem.quantity <= 0) throw new BadRequestException(`La cantidad a recibir debe ser mayor a 0`);
      if (inputItem.quantity > pending) throw new BadRequestException(`No se puede recibir ${inputItem.quantity} unidades — solo quedan ${pending} pendientes`);
    }

    const updated = await this.purchaseRepository.registerReception(purchaseId, {
      date: new Date(),
      receivedBy: input.userId,
      notes: input.notes,
      items: input.items,
    });

    // Update stock and product lots for each received item
    for (const inputItem of input.items) {
      const purchaseItem = purchase.items.find(i => i.productId === inputItem.productId);
      if (!purchaseItem) continue;

      const currentStock = await this.stockRepository.findByProductAndCompany(inputItem.productId, purchase.companyId);
      const previousStock = currentStock?.quantity || 0;

      // If the item has a lot number, upsertProductLot handles the stock update internally.
      // Doing it here too would double-count.
      if (!purchaseItem.lotNumber) {
        await this.stockRepository.upsert(inputItem.productId, purchase.companyId, inputItem.quantity);
      }

      const product = await this.productRepository.findById(inputItem.productId);
      await this.recordStockMovement.execute({
        productId: inputItem.productId,
        companyId: purchase.companyId,
        movementType: StockMovementType.PURCHASE,
        quantity: inputItem.quantity,
        previousStock,
        newStock: previousStock + inputItem.quantity,
        referenceId: purchaseId,
        referenceType: 'Purchase',
        description: `Recepción ${purchase.supplier}: ${product?.name || inputItem.productId} x${inputItem.quantity}`,
        userId: input.userId,
        date: new Date(),
      });

      if (purchaseItem.lotNumber) {
        await this.upsertProductLot.execute({
          productId: inputItem.productId,
          companyId: purchase.companyId,
          lotNumber: purchaseItem.lotNumber,
          expirationDate: purchaseItem.expirationDate,
          quantity: inputItem.quantity,
          purchaseId,
          receivedAt: new Date(),
          skipMovement: true,
        });
      }
    }

    // Auto-receive all bonification items that haven't been received yet
    const bonifItems = (purchase as any).bonificationItems || [];
    for (const bonifItem of bonifItems) {
      if ((bonifItem.receivedQty || 0) >= bonifItem.quantity) continue;

      const currentStock = await this.stockRepository.findByProductAndCompany(bonifItem.productId, purchase.companyId);
      const previousStock = currentStock?.quantity || 0;
      const product = await this.productRepository.findById(bonifItem.productId);

      if (!bonifItem.lotNumber) {
        await this.stockRepository.upsert(bonifItem.productId, purchase.companyId, bonifItem.quantity);
      }

      await this.recordStockMovement.execute({
        productId: bonifItem.productId,
        companyId: purchase.companyId,
        movementType: StockMovementType.PURCHASE_BONUS,
        quantity: bonifItem.quantity,
        previousStock,
        newStock: previousStock + bonifItem.quantity,
        referenceId: purchaseId,
        referenceType: 'Purchase',
        description: `Bonificación ${purchase.supplier}: ${product?.name || bonifItem.productId} x${bonifItem.quantity}`,
        userId: input.userId,
        date: new Date(),
      });

      if (bonifItem.lotNumber) {
        await this.upsertProductLot.execute({
          productId: bonifItem.productId,
          companyId: purchase.companyId,
          lotNumber: bonifItem.lotNumber,
          expirationDate: bonifItem.expirationDate,
          quantity: bonifItem.quantity,
          purchaseId,
          receivedAt: new Date(),
          skipMovement: true,
        });
      }
    }

    return updated;
  }
}
