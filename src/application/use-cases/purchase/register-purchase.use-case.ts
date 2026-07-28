import { BadRequestException, Injectable, Inject } from '@nestjs/common';
import { IPurchaseRepository, PURCHASE_REPOSITORY } from '../../../domain/repositories/purchase.repository';
import { IStockRepository, STOCK_REPOSITORY } from '../../../domain/repositories/stock.repository';
import { IProductRepository, PRODUCT_REPOSITORY } from '../../../domain/repositories/product.repository';
import { IPriceTierRepository, PRICE_TIER_REPOSITORY } from '../../../domain/repositories/price-tier.repository';
import { StockMovementType } from '../../../domain/enums';
import { CreatePurchaseDto } from '../../dtos/purchase/create-purchase.dto';
import { getNowInTimezone } from '../../../shared/utils/date.util';
import { RecordStockMovementUseCase } from '../stock-movement/record-stock-movement.use-case';
import { CreateAccountPayableUseCase } from '../account-payable/create-account-payable.use-case';
import { UpsertProductLotUseCase } from '../product-lot/upsert-product-lot.use-case';

type ProductPrice = { priceTierId: string; companyId?: string; branchId?: string; price: number };

function upsertPrice(
  prices: ProductPrice[],
  tierId: string,
  companyId: string,
  branchId: string | undefined,
  price: number,
): ProductPrice[] {
  const idx = prices.findIndex((p) =>
    p.priceTierId === tierId
    && p.companyId === companyId
    && (p.branchId || undefined) === branchId,
  );
  if (idx >= 0) return prices.map((p, i) => (i === idx ? { ...p, price } : p));
  return [...prices, {
    priceTierId: tierId,
    companyId,
    ...(branchId ? { branchId } : {}),
    price,
  }];
}

@Injectable()
export class RegisterPurchaseUseCase {
  constructor(
    @Inject(PURCHASE_REPOSITORY) private readonly purchaseRepository: IPurchaseRepository,
    @Inject(STOCK_REPOSITORY) private readonly stockRepository: IStockRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly productRepository: IProductRepository,
    @Inject(PRICE_TIER_REPOSITORY) private readonly priceTierRepository: IPriceTierRepository,
    private readonly recordStockMovement: RecordStockMovementUseCase,
    private readonly createAccountPayable: CreateAccountPayableUseCase,
    private readonly upsertProductLot: UpsertProductLotUseCase,
  ) {}

  async execute(dto: CreatePurchaseDto, userId?: string, branchId?: string) {
    const isUsdPurchase = dto.totalCostUsd != null && dto.exchangeRate != null;
    let roundedTotal: number;
    let items = dto.items || [];

    if (isUsdPurchase) {
      roundedTotal = Math.round(dto.totalCostUsd! * dto.exchangeRate! * 100) / 100;
      const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
      const proratedUnitCost = totalQuantity > 0 ? Math.round((roundedTotal / totalQuantity) * 100) / 100 : 0;
      items = items.map(item => ({ ...item, unitCost: item.unitCost ?? proratedUnitCost }));
    } else if (dto.totalCost != null) {
      roundedTotal = Math.round(dto.totalCost * 100) / 100;
      const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
      const proratedUnitCost = totalQuantity > 0 ? Math.round((roundedTotal / totalQuantity) * 100) / 100 : 0;
      items = items.map(item => ({ ...item, unitCost: item.unitCost ?? proratedUnitCost }));
    } else {
      const totalCost = items.reduce((sum, item) => sum + item.quantity * (item.unitCost || 0), 0);
      roundedTotal = Math.round(totalCost * 100) / 100;
    }

    const purchaseDate = dto.date ? new Date(dto.date) : getNowInTimezone();
    const paymentType = (dto.paymentType || 'CONTADO') as 'CONTADO' | 'CREDITO' | 'PENDIENTE_ACUERDO';
    const normalizedItems = items.map((i: any) => ({
      ...i,
      markupPercent: i.markupPercent ?? 20,
      markupMinoristaPercent: i.markupMinoristaPercent ?? 15,
      markupEspecialPercent: i.markupEspecialPercent ?? 10,
      minMarginPercent: i.minMarginPercent ?? 5,
      expirationDate: i.expirationDate ? new Date(i.expirationDate) : undefined,
    }));

    for (const item of normalizedItems) {
      const floor = Math.round((item.unitCost || 0) * (1 + item.minMarginPercent / 100) * 100) / 100;
      const prices = [item.precioVenta, item.precioMinorista, item.precioEspecial]
        .filter((price) => price != null && price > 0);
      if (floor > 0 && prices.some((price) => price < floor)) {
        throw new BadRequestException(`Un precio de venta no puede ser menor al precio piso (S/ ${floor.toFixed(2)})`);
      }
    }

    const normalizedBonifItems = (dto.bonificationItems || []).map((i: any) => ({
      ...i,
      unitCost: 0,
      expirationDate: i.expirationDate ? new Date(i.expirationDate) : undefined,
    }));

    const purchase = await this.purchaseRepository.create({
      companyId: dto.companyId, supplier: dto.supplier, items: normalizedItems,
      bonificationItems: normalizedBonifItems,
      totalCost: roundedTotal, paymentType,
      paymentScheduleType: paymentType === 'CREDITO' ? dto.paymentScheduleType as 'SINGLE_DATE' | 'INSTALLMENTS' : undefined,
      dueDate: paymentType === 'CREDITO' && dto.dueDate ? new Date(dto.dueDate) : undefined,
      date: purchaseDate, createdBy: userId,
      totalCostUsd: isUsdPurchase ? dto.totalCostUsd : undefined,
      exchangeRate: isUsdPurchase ? dto.exchangeRate : undefined,
      supplierId: dto.supplierId, supplierRuc: dto.supplierRuc,
      documentType: dto.documentType as any,
      documentSeries: dto.documentSeries,
      documentNumber: dto.documentNumber,
      issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
      isHistorical: dto.isHistorical,
      receptionStatus: dto.isHistorical ? 'RECEIVED' : undefined,
      remisionGuia: dto.remisionGuia
        ? { serie: dto.remisionGuia.serie, correlativo: dto.remisionGuia.correlativo, fecha: new Date(dto.remisionGuia.fecha) }
        : undefined,
    });
    // Stock is NOT updated here — updated when goods are received via POST /purchases/:id/receive

    if (paymentType === 'CREDITO' || paymentType === 'PENDIENTE_ACUERDO') {
      const scheduleType = paymentType === 'PENDIENTE_ACUERDO'
        ? 'PENDIENTE_ACUERDO'
        : (dto.paymentScheduleType || 'SINGLE_DATE');
      await this.createAccountPayable.execute({
        purchaseId: purchase.id!,
        supplier: dto.supplier,
        totalAmount: isUsdPurchase ? dto.totalCostUsd! : roundedTotal,
        paymentScheduleType: scheduleType as 'SINGLE_DATE' | 'INSTALLMENTS' | 'PENDIENTE_ACUERDO',
        dueDate: scheduleType === 'SINGLE_DATE' && dto.dueDate ? new Date(dto.dueDate) : undefined,
        installments: scheduleType === 'INSTALLMENTS' && dto.installments
          ? dto.installments.map(i => ({ amount: i.amount, dueDate: new Date(i.dueDate) }))
          : undefined,
        currency: isUsdPurchase ? 'USD' : 'PEN',
        totalAmountPen: isUsdPurchase ? roundedTotal : undefined,
        isHistorical: dto.isHistorical,
        userId,
      });
    }

    // Sync sale prices + minSalePrice to products (best-effort: never fails the purchase)
    try {
      const itemsWithProduct = (dto.items || []).filter((i) => i.productId);
      if (itemsWithProduct.length > 0) {
        const allTiers = dto.companyId
          ? await this.priceTierRepository.findAll({ isActive: true })
          : [];
        const sortedTiers = [...allTiers].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
        const mayoristaTier = sortedTiers[0]; // tier de mayor prioridad → precioVenta
        const minoristaTier = sortedTiers[1]; // tier de segunda prioridad → precioMinorista
        const especialTier  = sortedTiers[2]; // tier de tercera prioridad → precioEspecial

        // unitCost per productId resolved from the normalized items array
        const unitCostMap = new Map(items.map((i: any) => [i.productId, i.unitCost ?? 0]));

        for (const item of itemsWithProduct) {
          const product = await this.productRepository.findById(item.productId);
          if (!product) continue;

          let prices: ProductPrice[] = [...product.prices];
          if (dto.companyId) {
            if (item.precioVenta && mayoristaTier?.id)
              prices = upsertPrice(prices, mayoristaTier.id, dto.companyId, branchId, item.precioVenta);
            if (item.precioMinorista && minoristaTier?.id)
              prices = upsertPrice(prices, minoristaTier.id, dto.companyId, branchId, item.precioMinorista);
            if (item.precioEspecial && especialTier?.id)
              prices = upsertPrice(prices, especialTier.id, dto.companyId, branchId, item.precioEspecial);
          }

          const normalizedItem: any = normalizedItems.find((i: any) => i.productId === item.productId);
          const unitCost = unitCostMap.get(item.productId) ?? 0;
          const updates: Partial<import('../../../domain/entities/product.entity').ProductEntity> = { prices };
          if (unitCost > 0) {
            // Precio piso = costo de adquisición + margen mínimo configurable.
            const minMarginPercent = normalizedItem?.minMarginPercent ?? 5;
            updates.minMarginPercent = minMarginPercent;
            updates.minSalePrice = Math.round(unitCost * (1 + minMarginPercent / 100) * 100) / 100;
          }
          if (dto.supplier) updates.supplier = dto.supplier;

          await this.productRepository.update(product.id!, updates);
        }
      }
    } catch { /* price sync is non-critical; purchase already saved */ }

    return purchase;
  }
}
