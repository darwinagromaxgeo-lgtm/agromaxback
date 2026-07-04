import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { ILoanRepository, LOAN_REPOSITORY } from '../../../domain/repositories/loan.repository';
import { IStockRepository, STOCK_REPOSITORY } from '../../../domain/repositories/stock.repository';
import { IProductRepository, PRODUCT_REPOSITORY } from '../../../domain/repositories/product.repository';
import { IProductLotRepository, PRODUCT_LOT_REPOSITORY } from '../../../domain/repositories/product-lot.repository';
import { StockMovementType } from '../../../domain/enums';
import { ReturnLoanDto } from '../../dtos/loan/return-loan.dto';
import { getNowInTimezone } from '../../../shared/utils/date.util';
import { RecordStockMovementUseCase } from '../stock-movement/record-stock-movement.use-case';

@Injectable()
export class ReturnLoanItemsUseCase {
  constructor(
    @Inject(LOAN_REPOSITORY) private readonly loanRepository: ILoanRepository,
    @Inject(STOCK_REPOSITORY) private readonly stockRepository: IStockRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly productRepository: IProductRepository,
    @Inject(PRODUCT_LOT_REPOSITORY) private readonly lotRepository: IProductLotRepository,
    private readonly recordStockMovement: RecordStockMovementUseCase,
  ) {}

  async execute(loanId: string, dto: ReturnLoanDto, userId?: string) {
    const loan = await this.loanRepository.findById(loanId);
    if (!loan) throw new BadRequestException('Préstamo no encontrado');
    if (loan.status === 'RETURNED') throw new BadRequestException('El préstamo ya fue devuelto completamente');

    // Validate quantities
    for (const returnItem of dto.items) {
      const loanItem = loan.items.find(
        (i) => i.productId === returnItem.productId && i.companyId === returnItem.companyId,
      );
      if (!loanItem) {
        throw new BadRequestException(
          `El producto ${returnItem.productId} con empresa ${returnItem.companyId} no pertenece a este préstamo`,
        );
      }
      const pending = loanItem.quantity - loanItem.returnedQuantity;
      if (returnItem.quantity > pending) {
        throw new BadRequestException(
          `La cantidad a devolver (${returnItem.quantity}) excede el pendiente (${pending}) para el producto ${returnItem.productId}`,
        );
      }
    }

    const returnDate = getNowInTimezone();

    // Increment stock and record movements
    for (const returnItem of dto.items) {
      const stock = await this.stockRepository.findByProductAndCompany(returnItem.productId, returnItem.companyId);
      const previousStock = stock?.quantity || 0;
      await this.stockRepository.upsert(returnItem.productId, returnItem.companyId, +returnItem.quantity);
      const product = await this.productRepository.findById(returnItem.productId);
      const productLabel = `${product?.name || returnItem.productId} x${returnItem.quantity}`;
      await this.recordStockMovement.execute({
        productId: returnItem.productId,
        companyId: returnItem.companyId,
        movementType: StockMovementType.LOAN_RETURN,
        quantity: returnItem.quantity,
        previousStock,
        newStock: previousStock + returnItem.quantity,
        referenceId: loanId,
        referenceType: 'Loan',
        description: `Devolución préstamo: ${productLabel}`,
        userId,
        date: returnDate,
      });

      if (product?.tracksLot) {
        // Restore to lots in FEFO order (earliest expiring first), including inactive ones
        const lots = await this.lotRepository.findByProductAndCompany(returnItem.productId, returnItem.companyId, false);
        let remaining = returnItem.quantity;
        for (const lot of lots) {
          if (remaining <= 0) break;
          await this.lotRepository.restoreQuantity(lot.id!, remaining);
          remaining = 0;
        }
      }
    }

    // Add return record
    await this.loanRepository.addReturn(loanId, {
      items: dto.items,
      notes: dto.notes,
      returnedBy: userId,
      date: returnDate,
    });

    // Update returned quantities and status
    const updatedItems = loan.items.map((item) => {
      const returnItem = dto.items.find(
        (ri) => ri.productId === item.productId && ri.companyId === item.companyId,
      );
      return {
        ...item,
        returnedQuantity: item.returnedQuantity + (returnItem?.quantity || 0),
      };
    });

    const allReturned = updatedItems.every((i) => i.returnedQuantity >= i.quantity);
    const someReturned = updatedItems.some((i) => i.returnedQuantity > 0);
    const newStatus = allReturned ? 'RETURNED' : someReturned ? 'PARTIAL' : 'ACTIVE';

    return this.loanRepository.update(loanId, {
      items: updatedItems,
      status: newStatus as 'ACTIVE' | 'PARTIAL' | 'RETURNED',
    });
  }
}
