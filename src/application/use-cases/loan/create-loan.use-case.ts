import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { ILoanRepository, LOAN_REPOSITORY } from '../../../domain/repositories/loan.repository';
import { IStockRepository, STOCK_REPOSITORY } from '../../../domain/repositories/stock.repository';
import { IProductRepository, PRODUCT_REPOSITORY } from '../../../domain/repositories/product.repository';
import { IProductLotRepository, PRODUCT_LOT_REPOSITORY } from '../../../domain/repositories/product-lot.repository';
import { StockMovementType } from '../../../domain/enums';
import { CreateLoanDto } from '../../dtos/loan/create-loan.dto';
import { getNowInTimezone } from '../../../shared/utils/date.util';
import { RecordStockMovementUseCase } from '../stock-movement/record-stock-movement.use-case';

@Injectable()
export class CreateLoanUseCase {
  constructor(
    @Inject(LOAN_REPOSITORY) private readonly loanRepository: ILoanRepository,
    @Inject(STOCK_REPOSITORY) private readonly stockRepository: IStockRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly productRepository: IProductRepository,
    @Inject(PRODUCT_LOT_REPOSITORY) private readonly lotRepository: IProductLotRepository,
    private readonly recordStockMovement: RecordStockMovementUseCase,
  ) {}

  async execute(dto: CreateLoanDto, userId?: string) {
    const stockSnapshots: Map<string, number> = new Map();
    for (const item of dto.items) {
      const stock = await this.stockRepository.findByProductAndCompany(item.productId, item.companyId);
      if (!stock || stock.quantity < item.quantity) {
        const product = await this.productRepository.findById(item.productId);
        const available = stock?.quantity || 0;
        throw new BadRequestException(
          `Sin stock suficiente para "${product?.name || item.productId}". Disponible: ${available}, solicitado: ${item.quantity}`,
        );
      }
      stockSnapshots.set(`${item.productId}:${item.companyId}`, stock.quantity);
    }

    const loanDate = dto.date ? new Date(dto.date) : getNowInTimezone();

    const loan = await this.loanRepository.create({
      borrowerName: dto.borrowerName,
      items: dto.items.map((item) => ({
        productId: item.productId,
        companyId: item.companyId,
        quantity: item.quantity,
        returnedQuantity: 0,
      })),
      status: 'ACTIVE',
      returns: [],
      notes: dto.notes,
      date: loanDate,
      createdBy: userId,
    });

    for (const item of dto.items) {
      const previousStock = stockSnapshots.get(`${item.productId}:${item.companyId}`) || 0;
      await this.stockRepository.upsert(item.productId, item.companyId, -item.quantity);
      const product = await this.productRepository.findById(item.productId);
      const productLabel = `${product?.name || item.productId} x${item.quantity}`;
      await this.recordStockMovement.execute({
        productId: item.productId,
        companyId: item.companyId,
        movementType: StockMovementType.LOAN_OUT,
        quantity: item.quantity,
        previousStock,
        newStock: previousStock - item.quantity,
        referenceId: loan.id,
        referenceType: 'Loan',
        description: `Préstamo: ${productLabel}`,
        userId,
        date: loanDate,
      });
      stockSnapshots.set(`${item.productId}:${item.companyId}`, previousStock - item.quantity);

      if (product?.tracksLot) {
        const lots = await this.lotRepository.findByProductAndCompany(item.productId, item.companyId, true);
        let remaining = item.quantity;
        for (const lot of lots) {
          if (remaining <= 0) break;
          if (lot.currentQuantity <= 0) continue;
          const toConsume = Math.min(remaining, lot.currentQuantity);
          await this.lotRepository.consumeQuantity(lot.id!, toConsume);
          remaining -= toConsume;
        }
      }
    }

    return loan;
  }
}
