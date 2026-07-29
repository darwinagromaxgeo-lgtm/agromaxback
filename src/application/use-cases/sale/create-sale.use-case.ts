import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { ISaleRepository, SALE_REPOSITORY } from '../../../domain/repositories/sale.repository';
import { IStockRepository, STOCK_REPOSITORY } from '../../../domain/repositories/stock.repository';
import { IProductRepository, PRODUCT_REPOSITORY } from '../../../domain/repositories/product.repository';
import { IProductLotRepository, PRODUCT_LOT_REPOSITORY } from '../../../domain/repositories/product-lot.repository';
import { IPaymentMethodRepository, PAYMENT_METHOD_REPOSITORY } from '../../../domain/repositories/payment-method.repository';
import { CashRegisterEntryType, CashRegisterEntryCategory, StockMovementType } from '../../../domain/enums';
import { CreateSaleDto } from '../../dtos/sale/create-sale.dto';
import { getNowInTimezone } from '../../../shared/utils/date.util';
import { OpenCashRegisterUseCase } from '../cash-register/open-cash-register.use-case';
import { AddEntryUseCase } from '../cash-register/add-entry.use-case';
import { CreateCreditAccountUseCase } from '../credit-account/create-credit-account.use-case';
import { AddSaleToCreditUseCase } from '../credit-account/add-sale-to-credit.use-case';
import { RecordStockMovementUseCase } from '../stock-movement/record-stock-movement.use-case';
import { CLIENT_REPOSITORY, IClientRepository } from '../../../domain/repositories/client.repository';
import {
  CREDIT_ACCOUNT_REPOSITORY,
  ICreditAccountRepository,
} from '../../../domain/repositories/credit-account.repository';

@Injectable()
export class CreateSaleUseCase {
  constructor(
    @Inject(SALE_REPOSITORY) private readonly saleRepository: ISaleRepository,
    @Inject(STOCK_REPOSITORY) private readonly stockRepository: IStockRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly productRepository: IProductRepository,
    @Inject(PRODUCT_LOT_REPOSITORY) private readonly lotRepository: IProductLotRepository,
    @Inject(PAYMENT_METHOD_REPOSITORY) private readonly paymentMethodRepository: IPaymentMethodRepository,
    @Inject(CLIENT_REPOSITORY) private readonly clientRepository: IClientRepository,
    @Inject(CREDIT_ACCOUNT_REPOSITORY)
    private readonly creditRepository: ICreditAccountRepository,
    private readonly openCashRegister: OpenCashRegisterUseCase,
    private readonly addCashEntry: AddEntryUseCase,
    private readonly createCreditAccount: CreateCreditAccountUseCase,
    private readonly addSaleToCredit: AddSaleToCreditUseCase,
    private readonly recordStockMovement: RecordStockMovementUseCase,
  ) {}

  async execute(dto: CreateSaleDto, userId?: string, branchId?: string) {
    if (!branchId) throw new BadRequestException('Selecciona una sucursal para registrar la venta');
    const isCredit = dto.isCredit || false;

    if (isCredit && !dto.clientId) {
      throw new BadRequestException('El cliente es requerido para ventas a crédito');
    }

    if (isCredit && dto.payments && dto.payments.length > 0) {
      throw new BadRequestException('Las ventas a crédito no deben tener pagos');
    }

    if (!isCredit && (!dto.payments || dto.payments.length === 0)) {
      throw new BadRequestException('Se requiere al menos un método de pago para ventas inmediatas');
    }

    if (dto.clientId) {
      const client = await this.clientRepository.findById(dto.clientId);
      if (!client || client.branchId !== branchId) {
        throw new BadRequestException('El cliente no pertenece a la sucursal activa');
      }
    }

    if (dto.creditAccountId) {
      const credit = await this.creditRepository.findById(dto.creditAccountId);
      if (!credit) {
        throw new BadRequestException('Cuenta de crédito no encontrada en la sucursal activa');
      }
      if (credit.status === 'PAID') {
        throw new BadRequestException('La cuenta de crédito ya está completamente pagada');
      }
      if (credit.clientId !== dto.clientId) {
        throw new BadRequestException('La cuenta de crédito no pertenece al cliente seleccionado');
      }
    }

    const stockSnapshots: Map<string, number> = new Map();
    for (const item of dto.items) {
      const product = await this.productRepository.findById(item.productId);
      let available: number;
      if (product?.tracksLot) {
        const lots = await this.lotRepository.findByProductAndCompany(item.productId, item.companyId, true);
        available = lots.reduce((sum, l) => sum + l.currentQuantity, 0);
      } else {
        const stock = await this.stockRepository.findByProductAndCompany(item.productId, item.companyId);
        available = stock?.quantity ?? 0;
      }
      if (available < item.quantity) {
        throw new BadRequestException(
          `Sin stock suficiente para "${product?.name || item.productId}". Disponible: ${available}, solicitado: ${item.quantity}`,
        );
      }
      stockSnapshots.set(`${item.productId}:${item.companyId}`, available);
    }

    const items = dto.items.map((item) => ({
      productId: item.productId,
      companyId: item.companyId,
      quantity: item.quantity,
      priceTier: item.priceTier,
      unitPrice: item.unitPrice,
      subtotal: Math.round(item.quantity * item.unitPrice * 100) / 100,
    }));
    const total = items.reduce((sum, item) => sum + item.subtotal, 0);
    const roundedTotal = Math.round(total * 100) / 100;
    const saleDate = dto.date ? new Date(dto.date) : getNowInTimezone();

    // Validate payment amounts sum equals total
    let paymentsData: { paymentMethodId: string; paymentMethodName: string; amount: number }[] = [];
    if (!isCredit && dto.payments) {
      const paymentSum = Math.round(dto.payments.reduce((sum, p) => sum + p.amount, 0) * 100) / 100;
      if (paymentSum !== roundedTotal) {
        throw new BadRequestException(`La suma de los pagos (${paymentSum}) no coincide con el total de la venta (${roundedTotal})`);
      }

      // Resolve payment method names
      for (const payment of dto.payments) {
        const method = await this.paymentMethodRepository.findById(payment.paymentMethodId);
        if (!method) {
          throw new BadRequestException(`Método de pago no encontrado: ${payment.paymentMethodId}`);
        }
        paymentsData.push({
          paymentMethodId: payment.paymentMethodId,
          paymentMethodName: method.name,
          amount: payment.amount,
        });
      }
    }

    const sale = await this.saleRepository.create({
      branchId,
      companyId: dto.companyId,
      clientId: dto.clientId,
      items,
      total: roundedTotal,
      voucherType: dto.voucherType || 'NONE',
      isCredit,
      payments: paymentsData,
      date: saleDate,
      createdBy: userId,
    });

    const productNames: string[] = [];
    for (const item of dto.items) {
      const previousStock = stockSnapshots.get(`${item.productId}:${item.companyId}`) || 0;
      await this.stockRepository.upsert(item.productId, item.companyId, -item.quantity);
      const product = await this.productRepository.findById(item.productId);
      const productLabel = `${product?.name || item.productId} x${item.quantity}`;
      productNames.push(productLabel);

      if (product?.tracksLot) {
        if (item.lotId) {
          // Lote seleccionado manualmente (puede ser vencido)
          await this.lotRepository.consumeQuantity(item.lotId, item.quantity);
        } else {
          // FEFO: descontar lotes en orden de vencimiento más próximo primero
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

      await this.recordStockMovement.execute({
        productId: item.productId,
        companyId: item.companyId,
        movementType: StockMovementType.SALE,
        quantity: item.quantity,
        previousStock,
        newStock: previousStock - item.quantity,
        referenceId: sale.id,
        referenceType: 'Sale',
        description: `Venta: ${productLabel}`,
        userId,
        date: saleDate,
      });
      stockSnapshots.set(`${item.productId}:${item.companyId}`, previousStock - item.quantity);
    }

    if (!isCredit) {
      const description = productNames.join(', ');
      const register = await this.openCashRegister.execute({}, userId);

      for (const payment of paymentsData) {
        await this.addCashEntry.execute(register.id!, {
          type: CashRegisterEntryType.INCOME,
          category: CashRegisterEntryCategory.SALE,
          description: `${description} [${payment.paymentMethodName}]`,
          amount: payment.amount,
          referenceId: sale.id,
          referenceType: 'Sale',
          voucherType: dto.voucherType || 'NONE',
        }, userId);
      }
    }

    if (isCredit) {
      if (dto.creditAccountId) {
        await this.addSaleToCredit.execute(dto.creditAccountId, sale.id!, roundedTotal);
      } else {
        await this.createCreditAccount.execute(
          dto.clientId!,
          sale.id!,
          roundedTotal,
          userId,
          dto.creditName,
          branchId,
        );
      }
    }

    return sale;
  }
}
