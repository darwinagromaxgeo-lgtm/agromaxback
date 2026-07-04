import { Injectable, Inject } from '@nestjs/common';
import { IProductLotRepository, PRODUCT_LOT_REPOSITORY } from '../../../domain/repositories/product-lot.repository';
import { IStockRepository, STOCK_REPOSITORY } from '../../../domain/repositories/stock.repository';
import { ProductLotEntity } from '../../../domain/entities/product-lot.entity';
import { RecordStockMovementUseCase } from '../stock-movement/record-stock-movement.use-case';
import { StockMovementType } from '../../../domain/enums';

@Injectable()
export class UpsertProductLotUseCase {
  constructor(
    @Inject(PRODUCT_LOT_REPOSITORY) private readonly lotRepo: IProductLotRepository,
    @Inject(STOCK_REPOSITORY) private readonly stockRepo: IStockRepository,
    private readonly recordStockMovement: RecordStockMovementUseCase,
  ) {}

  async execute(input: {
    productId: string;
    companyId: string;
    lotNumber: string;
    expirationDate?: Date;
    quantity: number;
    purchaseId?: string;
    receivedAt?: Date;
    userId?: string;
    skipMovement?: boolean;
  }): Promise<ProductLotEntity> {
    const existing = await this.lotRepo.findByProductCompanyLot(input.productId, input.companyId, input.lotNumber);
    let lot: ProductLotEntity;

    const currentStock = await this.stockRepo.findByProductAndCompany(input.productId, input.companyId);
    const previousStock = currentStock?.quantity ?? 0;

    if (existing) {
      lot = (await this.lotRepo.incrementQuantity(existing.id!, input.quantity))!;
    } else {
      lot = await this.lotRepo.create({
        productId: input.productId,
        companyId: input.companyId,
        lotNumber: input.lotNumber,
        expirationDate: input.expirationDate,
        initialQuantity: input.quantity,
        currentQuantity: input.quantity,
        purchaseId: input.purchaseId,
        receivedAt: input.receivedAt ?? new Date(),
        isActive: true,
      });
    }

    await this.stockRepo.upsert(input.productId, input.companyId, input.quantity);

    if (!input.skipMovement) {
      await this.recordStockMovement.execute({
        productId: input.productId,
        companyId: input.companyId,
        movementType: StockMovementType.ADJUSTMENT_IN,
        quantity: input.quantity,
        previousStock,
        newStock: previousStock + input.quantity,
        referenceId: lot.id,
        referenceType: 'Lot',
        description: `Ingreso lote ${input.lotNumber}`,
        userId: input.userId,
        date: input.receivedAt ?? new Date(),
      });
    }

    return lot;
  }
}
