import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { IStockRepository, STOCK_REPOSITORY } from '../../../domain/repositories/stock.repository';
import { IStockTransferRepository, STOCK_TRANSFER_REPOSITORY } from '../../../domain/repositories/stock-transfer.repository';
import { IProductLotRepository, PRODUCT_LOT_REPOSITORY } from '../../../domain/repositories/product-lot.repository';
import { IProductRepository, PRODUCT_REPOSITORY } from '../../../domain/repositories/product.repository';
import { StockMovementType } from '../../../domain/enums';
import { TransferStockDto } from '../../dtos/stock/transfer-stock.dto';
import { RecordStockMovementUseCase } from '../stock-movement/record-stock-movement.use-case';
import { UpsertProductLotUseCase } from '../product-lot/upsert-product-lot.use-case';

@Injectable()
export class TransferStockUseCase {
  constructor(
    @Inject(STOCK_REPOSITORY) private readonly stockRepository: IStockRepository,
    @Inject(STOCK_TRANSFER_REPOSITORY) private readonly transferRepository: IStockTransferRepository,
    @Inject(PRODUCT_LOT_REPOSITORY) private readonly lotRepository: IProductLotRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly productRepository: IProductRepository,
    private readonly recordStockMovement: RecordStockMovementUseCase,
    private readonly upsertProductLot: UpsertProductLotUseCase,
  ) {}

  async execute(dto: TransferStockDto, userId: string) {
    if (dto.fromCompanyId === dto.toCompanyId) throw new BadRequestException('No se puede transferir a la misma empresa');
    for (const item of dto.items) {
      const stock = await this.stockRepository.findByProductAndCompany(item.productId, dto.fromCompanyId);
      if (!stock || stock.quantity < item.quantity) {
        const product = await this.productRepository.findById(item.productId);
        throw new BadRequestException(
          `Sin stock suficiente para "${product?.name || item.productId}". Disponible: ${stock?.quantity || 0}, solicitado: ${item.quantity}`,
        );
      }
      if (item.lotAllocations && item.lotAllocations.length > 0) {
        const total = item.lotAllocations.reduce((s, a) => s + a.quantity, 0);
        if (Math.abs(total - item.quantity) > 0.0001) {
          throw new BadRequestException(`La suma de lotes (${total}) no coincide con la cantidad del producto (${item.quantity})`);
        }
        for (const alloc of item.lotAllocations) {
          const lot = await this.lotRepository.findById(alloc.lotId);
          if (!lot) throw new BadRequestException(`Lote ${alloc.lotId} no encontrado`);
          if (lot.companyId !== dto.fromCompanyId) throw new BadRequestException(`Lote ${lot.lotNumber} no pertenece a la sucursal origen`);
          if (lot.currentQuantity < alloc.quantity) throw new BadRequestException(`Lote ${lot.lotNumber} solo tiene ${lot.currentQuantity} disponibles`);
        }
      }
    }
    const transferDate = new Date();
    const transfer = await this.transferRepository.create({
      fromCompanyId: dto.fromCompanyId, toCompanyId: dto.toCompanyId,
      items: dto.items, notes: dto.notes, transferredBy: userId, date: transferDate,
    });
    for (const item of dto.items) {
      const fromStock = await this.stockRepository.findByProductAndCompany(item.productId, dto.fromCompanyId);
      const fromPrev = fromStock?.quantity || 0;
      await this.stockRepository.upsert(item.productId, dto.fromCompanyId, -item.quantity);

      const toStock = await this.stockRepository.findByProductAndCompany(item.productId, dto.toCompanyId);
      const toPrev = toStock?.quantity || 0;
      await this.stockRepository.upsert(item.productId, dto.toCompanyId, item.quantity);

      const desc = dto.notes ? `Transferencia: ${dto.notes}` : 'Transferencia entre empresas';
      await this.recordStockMovement.execute({
        productId: item.productId,
        companyId: dto.fromCompanyId,
        movementType: StockMovementType.TRANSFER_OUT,
        quantity: item.quantity,
        previousStock: fromPrev,
        newStock: fromPrev - item.quantity,
        referenceId: transfer.id,
        referenceType: 'Transfer',
        description: desc,
        userId,
        date: transferDate,
      });
      await this.recordStockMovement.execute({
        productId: item.productId,
        companyId: dto.toCompanyId,
        movementType: StockMovementType.TRANSFER_IN,
        quantity: item.quantity,
        previousStock: toPrev,
        newStock: toPrev + item.quantity,
        referenceId: transfer.id,
        referenceType: 'Transfer',
        description: desc,
        userId,
        date: transferDate,
      });

      if (item.lotAllocations && item.lotAllocations.length > 0) {
        for (const alloc of item.lotAllocations) {
          const srcLot = await this.lotRepository.findById(alloc.lotId);
          if (!srcLot) continue;
          await this.lotRepository.incrementQuantity(srcLot.id!, -alloc.quantity);
          await this.upsertProductLot.execute({
            productId: srcLot.productId,
            companyId: dto.toCompanyId,
            lotNumber: srcLot.lotNumber,
            expirationDate: srcLot.expirationDate,
            quantity: alloc.quantity,
            receivedAt: transferDate,
          });
        }
      }
    }
    return transfer;
  }
}
