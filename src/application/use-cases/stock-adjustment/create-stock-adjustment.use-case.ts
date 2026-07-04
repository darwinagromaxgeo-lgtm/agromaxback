import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { IStockAdjustmentRepository, STOCK_ADJUSTMENT_REPOSITORY } from '../../../domain/repositories/stock-adjustment.repository';
import { IStockRepository, STOCK_REPOSITORY } from '../../../domain/repositories/stock.repository';
import { IProductLotRepository, PRODUCT_LOT_REPOSITORY } from '../../../domain/repositories/product-lot.repository';
import { IProductRepository, PRODUCT_REPOSITORY } from '../../../domain/repositories/product.repository';
import { CreateStockAdjustmentDto } from '../../dtos/stock-adjustment/create-stock-adjustment.dto';
import { StockAdjustmentType, StockMovementType } from '../../../domain/enums';
import { RecordStockMovementUseCase } from '../stock-movement/record-stock-movement.use-case';
import { UpsertProductLotUseCase } from '../product-lot/upsert-product-lot.use-case';

@Injectable()
export class CreateStockAdjustmentUseCase {
  constructor(
    @Inject(STOCK_ADJUSTMENT_REPOSITORY) private readonly adjustmentRepository: IStockAdjustmentRepository,
    @Inject(STOCK_REPOSITORY) private readonly stockRepository: IStockRepository,
    @Inject(PRODUCT_LOT_REPOSITORY) private readonly lotRepository: IProductLotRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly productRepository: IProductRepository,
    private readonly recordStockMovement: RecordStockMovementUseCase,
    private readonly upsertProductLot: UpsertProductLotUseCase,
  ) {}

  async execute(dto: CreateStockAdjustmentDto, userId?: string) {
    const stock = await this.stockRepository.findByProductAndCompany(dto.productId, dto.companyId);
    const previousQuantity = stock?.quantity || 0;

    if (dto.type === StockAdjustmentType.DECREASE && previousQuantity < dto.quantity) {
      throw new BadRequestException(`Stock insuficiente. Disponible: ${previousQuantity}`);
    }

    const quantityChange = dto.type === StockAdjustmentType.INCREASE ? dto.quantity : -dto.quantity;
    const newQuantity = previousQuantity + quantityChange;
    const adjustmentDate = new Date();

    // For tracksLot products, all INCREASE adjustments must go through upsertProductLot so the
    // lot sum (which drives the stock-page display) stays in sync with the stock table.
    const product = dto.type === StockAdjustmentType.INCREASE
      ? await this.productRepository.findById(dto.productId)
      : null;
    const productTracksLot = product?.tracksLot ?? false;

    // upsertProductLot handles the stock-table update internally; skip direct upsert to avoid double-counting.
    const lotWillHandleStock = dto.type === StockAdjustmentType.INCREASE && !!(dto.lotNumber || dto.expirationDate || productTracksLot);
    if (!lotWillHandleStock) {
      await this.stockRepository.upsert(dto.productId, dto.companyId, quantityChange);
    }

    const adjustment = await this.adjustmentRepository.create({
      productId: dto.productId,
      companyId: dto.companyId,
      type: dto.type,
      quantity: dto.quantity,
      reason: dto.reason,
      previousQuantity,
      newQuantity,
      adjustedBy: userId,
      date: adjustmentDate,
    });

    await this.recordStockMovement.execute({
      productId: dto.productId,
      companyId: dto.companyId,
      movementType: dto.type === StockAdjustmentType.INCREASE ? StockMovementType.ADJUSTMENT_IN : StockMovementType.ADJUSTMENT_OUT,
      quantity: dto.quantity,
      previousStock: previousQuantity,
      newStock: newQuantity,
      referenceId: adjustment.id,
      referenceType: 'Adjustment',
      description: `Ajuste: ${dto.reason}`,
      userId,
      date: adjustmentDate,
    });

    // DECREASE: consumir lotes en orden FEFO (primero el que vence antes)
    if (dto.type === StockAdjustmentType.DECREASE) {
      const activeLots = await this.lotRepository.findByProductAndCompany(dto.productId, dto.companyId, true);
      const sorted = activeLots.sort((a, b) => {
        if (!a.expirationDate) return 1;
        if (!b.expirationDate) return -1;
        return new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime();
      });
      let remaining = dto.quantity;
      for (const lot of sorted) {
        if (remaining <= 0) break;
        const consume = Math.min(lot.currentQuantity, remaining);
        await this.lotRepository.consumeQuantity(lot.id!, consume);
        remaining -= consume;
      }
    }

    // INCREASE: create/update the lot so the lot sum stays in sync with the stock table.
    // For tracksLot products without explicit lot info, auto-generate a lot number.
    if (dto.type === StockAdjustmentType.INCREASE && (dto.lotNumber || dto.expirationDate || productTracksLot)) {
      const lotNumber = dto.lotNumber?.trim() || `ADJ-${adjustmentDate.getFullYear()}${String(adjustmentDate.getMonth() + 1).padStart(2, '0')}${String(adjustmentDate.getDate()).padStart(2, '0')}-${adjustment.id?.slice(-4).toUpperCase()}`;
      await this.upsertProductLot.execute({
        productId: dto.productId,
        companyId: dto.companyId,
        lotNumber,
        expirationDate: dto.expirationDate ? new Date(dto.expirationDate) : undefined,
        quantity: dto.quantity,
        receivedAt: adjustmentDate,
        skipMovement: true,
      });
    }

    return adjustment;
  }
}
