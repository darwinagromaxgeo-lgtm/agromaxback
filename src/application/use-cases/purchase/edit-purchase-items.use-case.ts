import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { IPurchaseRepository, PURCHASE_REPOSITORY } from '../../../domain/repositories/purchase.repository';
import { IStockRepository, STOCK_REPOSITORY } from '../../../domain/repositories/stock.repository';
import { IProductRepository, PRODUCT_REPOSITORY } from '../../../domain/repositories/product.repository';
import { IProductLotRepository, PRODUCT_LOT_REPOSITORY } from '../../../domain/repositories/product-lot.repository';
import { IPriceTierRepository, PRICE_TIER_REPOSITORY } from '../../../domain/repositories/price-tier.repository';
import { StockMovementType } from '../../../domain/enums';
import { RecordStockMovementUseCase } from '../stock-movement/record-stock-movement.use-case';
import { UpsertProductLotUseCase } from '../product-lot/upsert-product-lot.use-case';
import { EditPurchaseItemsDto } from '../../dtos/purchase/edit-purchase-items.dto';

@Injectable()
export class EditPurchaseItemsUseCase {
  constructor(
    @Inject(PURCHASE_REPOSITORY) private readonly purchaseRepository: IPurchaseRepository,
    @Inject(STOCK_REPOSITORY) private readonly stockRepository: IStockRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly productRepository: IProductRepository,
    @Inject(PRODUCT_LOT_REPOSITORY) private readonly lotRepository: IProductLotRepository,
    @Inject(PRICE_TIER_REPOSITORY) private readonly priceTierRepository: IPriceTierRepository,
    private readonly recordStockMovement: RecordStockMovementUseCase,
    private readonly upsertProductLot: UpsertProductLotUseCase,
  ) {}

  async execute(
    purchaseId: string,
    dto: EditPurchaseItemsDto,
    userId?: string,
    branchId?: string,
  ) {
    const purchase = await this.purchaseRepository.findById(purchaseId);
    if (!purchase) throw new NotFoundException('Compra no encontrada');

    const companyId = purchase.companyId;

    const isPending = purchase.receptionStatus === 'PENDING';
    const isHistorical = (purchase as any).isHistorical === true;
    const priceTiers = (await this.priceTierRepository.findAll({ isActive: true }))
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

    // ── Edits to existing items ──────────────────────────────────────────────
    for (const edit of dto.edits ?? []) {
      const existingItem = purchase.items.find((i) => i.productId === edit.productId);
      if (!existingItem) throw new BadRequestException(`Producto ${edit.productId} no pertenece a esta compra`);

      const product = await this.productRepository.findById(edit.productId);
      const isTracksLot = product?.tracksLot ?? false;
      const pricing = {
        unitCost: edit.unitCost ?? existingItem.unitCost ?? 0,
        precioVenta: edit.precioVenta ?? existingItem.precioVenta,
        precioMinorista: edit.precioMinorista ?? existingItem.precioMinorista,
        precioEspecial: edit.precioEspecial ?? existingItem.precioEspecial,
        markupPercent: edit.markupPercent ?? existingItem.markupPercent ?? 20,
        markupMinoristaPercent: edit.markupMinoristaPercent ?? existingItem.markupMinoristaPercent ?? 15,
        markupEspecialPercent: edit.markupEspecialPercent ?? existingItem.markupEspecialPercent ?? 10,
        minMarginPercent: edit.minMarginPercent ?? existingItem.minMarginPercent ?? 5,
      };
      this.validatePriceFloor(pricing);

      const wantsQuantityChange = edit.quantity !== undefined && edit.quantity !== existingItem.quantity;
      const wantsLotChange = edit.lotNumber !== undefined || edit.expirationDate !== undefined;

      let lot: any = null;
      if (!isPending && !isHistorical && isTracksLot && existingItem.lotNumber) {
        lot = await this.lotRepository.findByProductCompanyLot(edit.productId, companyId, existingItem.lotNumber);
      }

      // For received non-historical purchases, quantity/lot changes on non-lot-tracked products are blocked
      if (!isPending && !isHistorical && (wantsQuantityChange || wantsLotChange) && !isTracksLot) {
        throw new BadRequestException(
          `"${product?.name || edit.productId}": solo los productos con trazabilidad de lote permiten editar cantidad y datos del lote`,
        );
      }

      // For received non-historical purchases, check the lot hasn't been partially sold
      if (!isPending && !isHistorical && (wantsQuantityChange || wantsLotChange) && isTracksLot) {
        if (!lot) throw new BadRequestException(`No se encontró el lote del producto "${product?.name}"`);
        if (lot.currentQuantity < (lot.initialQuantity ?? 0)) {
          const sold = (lot.initialQuantity ?? 0) - lot.currentQuantity;
          throw new BadRequestException(
            `"${product?.name}": ya hay ${sold} unidad(es) vendidas — no se puede modificar cantidad ni lote`,
          );
        }
      }

      // Build purchase-item patch
      const patch: any = {};
      if (edit.unitCost !== undefined) patch.unitCost = edit.unitCost;
      if (edit.unitPriceSinIgv !== undefined) patch.unitPriceSinIgv = edit.unitPriceSinIgv;
      if (edit.unitPriceConIgv !== undefined) patch.unitPriceConIgv = edit.unitPriceConIgv;
      if (edit.precioVenta !== undefined) patch.precioVenta = edit.precioVenta;
      if (edit.precioMinorista !== undefined) patch.precioMinorista = edit.precioMinorista;
      if (edit.precioEspecial !== undefined) patch.precioEspecial = edit.precioEspecial;
      if (edit.markupPercent !== undefined) patch.markupPercent = edit.markupPercent;
      if (edit.markupMinoristaPercent !== undefined) patch.markupMinoristaPercent = edit.markupMinoristaPercent;
      if (edit.markupEspecialPercent !== undefined) patch.markupEspecialPercent = edit.markupEspecialPercent;
      if (edit.minMarginPercent !== undefined) patch.minMarginPercent = edit.minMarginPercent;

      if (wantsQuantityChange) {
        patch.quantity = edit.quantity;
        if (!isPending && !isHistorical && lot) {
          const delta = edit.quantity! - existingItem.quantity;
          if (existingItem.receivedQty === existingItem.quantity) {
            patch.receivedQty = edit.quantity;
          } else if (existingItem.receivedQty) {
            patch.receivedQty = Math.min(existingItem.receivedQty, edit.quantity!);
          }
          const currentStock = await this.stockRepository.findByProductAndCompany(edit.productId, companyId);
          const previousStock = currentStock?.quantity || 0;
          await this.stockRepository.upsert(edit.productId, companyId, delta);
          await this.recordStockMovement.execute({
            productId: edit.productId,
            companyId,
            movementType: delta > 0 ? StockMovementType.ADJUSTMENT_IN : StockMovementType.ADJUSTMENT_OUT,
            quantity: Math.abs(delta),
            previousStock,
            newStock: previousStock + delta,
            referenceId: purchaseId,
            referenceType: 'Purchase',
            description: `Ajuste edición compra: ${product?.name || edit.productId} (${delta > 0 ? '+' : ''}${delta})`,
            userId,
            date: new Date(),
          });
          await this.lotRepository.adjustQuantity(lot.id, delta);
        }
      }

      if (wantsLotChange) {
        const lotPatch: any = {};
        if (edit.lotNumber !== undefined) {
          lotPatch.lotNumber = edit.lotNumber;
          patch.lotNumber = edit.lotNumber;
        }
        if (edit.expirationDate !== undefined) {
          const expDate = edit.expirationDate ? new Date(edit.expirationDate + 'T12:00:00.000Z') : null;
          lotPatch.expirationDate = expDate;
          patch.expirationDate = expDate ?? undefined;
        }
        if (!isPending && !isHistorical && lot) {
          await this.lotRepository.update(lot.id, lotPatch);
        }
      }

      await this.purchaseRepository.updateItem(purchaseId, edit.productId, patch);
      if (product) await this.syncProductPricing(product, companyId, pricing, priceTiers, branchId);
    }

    // ── Additions of new items ───────────────────────────────────────────────
    for (const addition of dto.additions ?? []) {
      if (purchase.items.find((i) => i.productId === addition.productId)) {
        throw new BadRequestException(`El producto ya está en esta compra — edítalo en su lugar`);
      }

      const product = await this.productRepository.findById(addition.productId);
      const isReceived = !isHistorical && purchase.receptionStatus === 'RECEIVED';
      const pricing = {
        unitCost: addition.unitCost ?? 0,
        precioVenta: addition.precioVenta,
        precioMinorista: addition.precioMinorista,
        precioEspecial: addition.precioEspecial,
        markupPercent: addition.markupPercent ?? 20,
        markupMinoristaPercent: addition.markupMinoristaPercent ?? 15,
        markupEspecialPercent: addition.markupEspecialPercent ?? 10,
        minMarginPercent: addition.minMarginPercent ?? 5,
      };
      this.validatePriceFloor(pricing);

      const newItem: any = {
        productId: addition.productId,
        productName: addition.productName || product?.name,
        quantity: addition.quantity,
        receivedQty: isReceived ? addition.quantity : 0,
        ...(addition.unitCost != null ? { unitCost: addition.unitCost } : {}),
        ...(addition.unitPriceSinIgv != null ? { unitPriceSinIgv: addition.unitPriceSinIgv } : {}),
        ...(addition.unitPriceConIgv != null ? { unitPriceConIgv: addition.unitPriceConIgv } : {}),
        ...(addition.precioVenta != null ? { precioVenta: addition.precioVenta } : {}),
        ...(addition.precioMinorista != null ? { precioMinorista: addition.precioMinorista } : {}),
        ...(addition.precioEspecial != null ? { precioEspecial: addition.precioEspecial } : {}),
        ...(addition.lotNumber ? { lotNumber: addition.lotNumber } : {}),
        ...(addition.expirationDate ? { expirationDate: new Date(addition.expirationDate + 'T12:00:00.000Z') } : {}),
        ...(addition.taxType ? { taxType: addition.taxType } : {}),
        ...(addition.flete != null ? { flete: addition.flete } : {}),
        ...(addition.otrosCostos != null ? { otrosCostos: addition.otrosCostos } : {}),
        markupPercent: addition.markupPercent ?? 20,
        markupMinoristaPercent: addition.markupMinoristaPercent ?? 15,
        markupEspecialPercent: addition.markupEspecialPercent ?? 10,
        minMarginPercent: addition.minMarginPercent ?? 5,
      };

      await this.purchaseRepository.addItem(purchaseId, newItem);
      if (product) await this.syncProductPricing(product, companyId, pricing, priceTiers, branchId);

      if (isReceived) {
        const currentStock = await this.stockRepository.findByProductAndCompany(addition.productId, companyId);
        const previousStock = currentStock?.quantity || 0;

        if (!addition.lotNumber) {
          await this.stockRepository.upsert(addition.productId, companyId, addition.quantity);
        }

        await this.recordStockMovement.execute({
          productId: addition.productId,
          companyId,
          movementType: StockMovementType.PURCHASE,
          quantity: addition.quantity,
          previousStock,
          newStock: previousStock + addition.quantity,
          referenceId: purchaseId,
          referenceType: 'Purchase',
          description: `Adición en edición de compra: ${product?.name || addition.productId} x${addition.quantity}`,
          userId,
          date: new Date(),
        });

        if (addition.lotNumber) {
          await this.upsertProductLot.execute({
            productId: addition.productId,
            companyId,
            lotNumber: addition.lotNumber,
            expirationDate: addition.expirationDate
              ? new Date(addition.expirationDate + 'T12:00:00.000Z')
              : undefined,
            quantity: addition.quantity,
            purchaseId,
            receivedAt: new Date(),
            skipMovement: true,
          });
        }
      }
    }

    // ── Bonification additions ───────────────────────────────────────────────
    for (const bonif of dto.bonificationAdditions ?? []) {
      const product = await this.productRepository.findById(bonif.productId);
      const isReceived = !isHistorical && purchase.receptionStatus === 'RECEIVED';

      await this.purchaseRepository.addBonificationItem(purchaseId, {
        productId: bonif.productId,
        productName: bonif.productName || product?.name,
        quantity: bonif.quantity,
        receivedQty: isReceived ? bonif.quantity : 0,
        unitCost: 0,
        ...(bonif.lotNumber ? { lotNumber: bonif.lotNumber } : {}),
        ...(bonif.expirationDate ? { expirationDate: new Date(bonif.expirationDate + 'T12:00:00.000Z') } : {}),
        ...(bonif.taxType ? { taxType: bonif.taxType } : {}),
      });

      if (isReceived) {
        const currentStock = await this.stockRepository.findByProductAndCompany(bonif.productId, companyId);
        const previousStock = currentStock?.quantity || 0;

        if (!bonif.lotNumber) {
          await this.stockRepository.upsert(bonif.productId, companyId, bonif.quantity);
        }

        await this.recordStockMovement.execute({
          productId: bonif.productId,
          companyId,
          movementType: StockMovementType.PURCHASE_BONUS,
          quantity: bonif.quantity,
          previousStock,
          newStock: previousStock + bonif.quantity,
          referenceId: purchaseId,
          referenceType: 'Purchase',
          description: `Bonificación (edición de compra): ${product?.name || bonif.productId} x${bonif.quantity}`,
          userId,
          date: new Date(),
        });

        if (bonif.lotNumber) {
          await this.upsertProductLot.execute({
            productId: bonif.productId,
            companyId,
            lotNumber: bonif.lotNumber,
            expirationDate: bonif.expirationDate
              ? new Date(bonif.expirationDate + 'T12:00:00.000Z')
              : undefined,
            quantity: bonif.quantity,
            purchaseId,
            receivedAt: new Date(),
            skipMovement: true,
          });
        }
      }

      // Historical purchases do not update stock — consistent with regular item additions
    }

    return this.purchaseRepository.findById(purchaseId);
  }

  private validatePriceFloor(pricing: {
    unitCost: number;
    precioVenta?: number;
    precioMinorista?: number;
    precioEspecial?: number;
    minMarginPercent: number;
  }) {
    if (pricing.minMarginPercent < 0) throw new BadRequestException('El margen mínimo no puede ser negativo');
    const floor = Math.round(pricing.unitCost * (1 + pricing.minMarginPercent / 100) * 100) / 100;
    const prices = [pricing.precioVenta, pricing.precioMinorista, pricing.precioEspecial]
      .filter((price): price is number => price != null && price > 0);
    if (floor > 0 && prices.some(price => price < floor)) {
      throw new BadRequestException(`Un precio de venta no puede ser menor al precio piso (S/ ${floor.toFixed(2)})`);
    }
  }

  private async syncProductPricing(
    product: any,
    companyId: string,
    pricing: any,
    tiers: any[],
    branchId?: string,
  ) {
    let prices = [...(product.prices || [])];
    const upsert = (tierId: string | undefined, price: number | undefined) => {
      if (!tierId || !price) return;
      const index = prices.findIndex((p: any) =>
        p.priceTierId === tierId
        && p.companyId === companyId
        && (p.branchId || undefined) === branchId,
      );
      const value = {
        priceTierId: tierId,
        companyId,
        ...(branchId ? { branchId } : {}),
        price,
      };
      if (index >= 0) prices[index] = value;
      else prices.push(value);
    };
    upsert(tiers[0]?.id, pricing.precioVenta);
    upsert(tiers[1]?.id, pricing.precioMinorista);
    upsert(tiers[2]?.id, pricing.precioEspecial);

    const updates: any = { prices };
    if (pricing.unitCost > 0) {
      updates.minMarginPercent = pricing.minMarginPercent;
      updates.minSalePrice = Math.round(pricing.unitCost * (1 + pricing.minMarginPercent / 100) * 100) / 100;
    }
    await this.productRepository.update(product.id!, updates);
  }
}
