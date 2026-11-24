import { Injectable, Inject, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ISaleRepository, SALE_REPOSITORY } from '../../../domain/repositories/sale.repository';
import { IStockRepository, STOCK_REPOSITORY } from '../../../domain/repositories/stock.repository';
import { IProductRepository, PRODUCT_REPOSITORY } from '../../../domain/repositories/product.repository';
import { IProductLotRepository, PRODUCT_LOT_REPOSITORY } from '../../../domain/repositories/product-lot.repository';
import { IPaymentMethodRepository, PAYMENT_METHOD_REPOSITORY } from '../../../domain/repositories/payment-method.repository';
import { IUserRepository, USER_REPOSITORY } from '../../../domain/repositories/user.repository';
import { assertConfiguredSalePrice } from '../../services/sale-price-permissions';
import { assertProductAllowsBilling } from '../../services/product-billing-eligibility';
import { CashRegisterEntryType, CashRegisterEntryCategory, StockMovementType } from '../../../domain/enums';
import { CreateSaleDto } from '../../dtos/sale/create-sale.dto';
import { getNowInTimezone } from '../../../shared/utils/date.util';
import { OpenCashRegisterUseCase } from '../cash-register/open-cash-register.use-case';
import { AddEntryUseCase } from '../cash-register/add-entry.use-case';
import { CreateCreditAccountUseCase } from '../credit-account/create-credit-account.use-case';
import { AddSaleToCreditUseCase } from '../credit-account/add-sale-to-credit.use-case';
import { RecordStockMovementUseCase } from '../stock-movement/record-stock-movement.use-case';
import { CLIENT_REPOSITORY, IClientRepository } from '../../../domain/repositories/client.repository';
import { ProductEntity } from '../../../domain/entities/product.entity';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { RegisterPaymentUseCase } from '../credit-account/register-payment.use-case';
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
    private readonly registerCreditPayment: RegisterPaymentUseCase,
    @InjectConnection() private readonly connection: Connection,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
  ) {}

  async execute(dto: CreateSaleDto, userId?: string, branchId?: string) {
    if (dto.isCredit && dto.payments?.length) {
      // Propagate the transaction to the existing repositories and nested use
      // cases: a failed deposit must not leave a sale, debt or stock deduction.
      this.connection.base.set('transactionAsyncLocalStorage', true);
      return this.connection.transaction(() => this.createSale(dto, userId, branchId));
    }
    return this.createSale(dto, userId, branchId);
  }

  private async createSale(dto: CreateSaleDto, userId?: string, branchId?: string) {
    if (!branchId) throw new BadRequestException('Selecciona una sucursal para registrar la venta');
    const isCredit = dto.isCredit || false;

    if (isCredit && !dto.clientId) {
      throw new BadRequestException('El cliente es requerido para ventas a crédito');
    }

    if (!isCredit && (!dto.payments || dto.payments.length === 0)) {
      throw new BadRequestException('Se requiere al menos un método de pago para ventas inmediatas');
    }

    if (dto.clientId) {
      const client = await this.clientRepository.findById(dto.clientId);
      if (!client || client.branchId !== branchId || !client.isActive) {
        throw new BadRequestException('El cliente no pertenece a la sucursal activa');
      }
    }

    if (dto.creditAccountId) {
      const credit = await this.creditRepository.findById(dto.creditAccountId);
      if (!isCredit || !credit || credit.branchId !== branchId) {
        throw new BadRequestException('Cuenta de crédito no encontrada en la sucursal activa');
      }
      if (['PAID', 'CANCELLED'].includes(credit.status)) {
        throw new BadRequestException('La cuenta de crédito ya está completamente pagada');
      }
      if (credit.clientId !== dto.clientId) {
        throw new BadRequestException('La cuenta de crédito no pertenece al cliente seleccionado');
      }
    }

    const stockSnapshots: Map<string, number> = new Map();
    const productSnapshots = new Map<string, ProductEntity>();
    const plannedLots = new Map<string, { id: string; currentQuantity: number }[]>();
    const allocations: { lotId: string; quantity: number }[][] = [];
    for (const [index, item] of dto.items.entries()) {
      const product = await this.productRepository.findById(item.productId);
      if (!product) throw new BadRequestException('Producto no encontrado');
      if (product.isActive === false) throw new BadRequestException(`El producto "${product.name}" está desactivado`);
      if (dto.voucherType && dto.voucherType !== 'NONE') assertProductAllowsBilling(product);
      if (product.catalogStatus === 'PENDING_REVIEW' || product.taxType === 'PENDIENTE') {
        throw new BadRequestException(`Completa el precio, la unidad y el IGV del producto "${product.name}" antes de venderlo`);
      }
      productSnapshots.set(item.productId, product);
      let available: number;
      if (product?.tracksLot) {
        const key = `${item.productId}:${item.companyId}`;
        if (!plannedLots.has(key)) plannedLots.set(key, (await this.lotRepository.findByProductAndCompany(item.productId, item.companyId, true)).map(lot => ({ id: lot.id!, currentQuantity: lot.currentQuantity })));
        const lots = plannedLots.get(key)!;
        available = lots.reduce((sum, l) => sum + l.currentQuantity, 0);
        const selected = item.lotId ? lots.filter(lot => lot.id === item.lotId) : lots;
        let remaining = item.quantity;
        allocations[index] = [];
        for (const lot of selected) {
          const quantity = Math.min(remaining, lot.currentQuantity);
          if (quantity <= 0) continue;
          allocations[index].push({ lotId: lot.id, quantity });
          lot.currentQuantity -= quantity;
          remaining = Math.round((remaining - quantity) * 1e6) / 1e6;
        }
        if (remaining > 0) throw new BadRequestException(`Sin stock suficiente en los lotes seleccionados de "${product.name}"`);
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

    const actor = userId ? await this.users.findById(userId) : null;
    if (!actor || !actor.isActive) throw new ForbiddenException('Usuario no disponible para registrar la venta');
    if (actor.role !== 'ADMIN') {
      for (const item of dto.items) assertConfiguredSalePrice(productSnapshots.get(item.productId)!, item, branchId);
    }

    const items = dto.items.map((item, index) => ({
      productId: item.productId,
      companyId: item.companyId,
      quantity: item.quantity,
      priceTier: item.priceTier,
      unitPrice: item.unitPrice,
      subtotal: Math.round(item.quantity * item.unitPrice * 100) / 100,
      productName: productSnapshots.get(item.productId)!.name,
      unit: productSnapshots.get(item.productId)!.unit,
      taxType: productSnapshots.get(item.productId)!.taxType || 'GRAVADO',
      taxRate: (productSnapshots.get(item.productId)!.taxType || 'GRAVADO') === 'GRAVADO' ? 0.18 : 0,
      lotAllocations: allocations[index],
    }));
    const total = items.reduce((sum, item) => sum + item.subtotal, 0);
    const roundedTotal = Math.round(total * 100) / 100;
    const saleDate = dto.date ? new Date(dto.date) : getNowInTimezone();

    // On credit sales, payments are the amounts received now, not the debt.
    let paymentsData: { paymentMethodId: string; paymentMethodName: string; amount: number }[] = [];
    if (dto.payments?.length) {
      for (const payment of dto.payments) {
        if (!Number.isFinite(payment.amount) || payment.amount <= 0 || Math.abs(payment.amount * 100 - Math.round(payment.amount * 100)) > 0.000001) {
          throw new BadRequestException('Cada pago debe tener un monto positivo con un máximo de dos decimales');
        }
      }
      const paymentSum = dto.payments.reduce((sum, p) => sum + Math.round(p.amount * 100), 0) / 100;
      if (isCredit && paymentSum >= roundedTotal) {
        throw new BadRequestException('El abono inicial debe ser menor al total. Para cobrar todo, utiliza pago inmediato');
      }
      if (!isCredit && paymentSum !== roundedTotal) {
        throw new BadRequestException(`La suma de los pagos (${paymentSum}) no coincide con el total de la venta (${roundedTotal})`);
      }

      // Resolve payment method names
      for (const payment of dto.payments) {
        const method = await this.paymentMethodRepository.findById(payment.paymentMethodId);
        if (!method || method.isActive === false) {
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
    for (const [index, item] of dto.items.entries()) {
      const previousStock = stockSnapshots.get(`${item.productId}:${item.companyId}`) || 0;
      await this.stockRepository.upsert(item.productId, item.companyId, -item.quantity);
      const product = await this.productRepository.findById(item.productId);
      const productLabel = `${product?.name || item.productId} x${item.quantity}`;
      productNames.push(productLabel);

      if (product?.tracksLot) {
        for (const allocation of items[index].lotAllocations || []) await this.lotRepository.consumeQuantity(allocation.lotId, allocation.quantity);
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
          paymentMethodId: payment.paymentMethodId,
          referenceId: sale.id,
          referenceType: 'Sale',
          voucherType: dto.voucherType || 'NONE',
        }, userId);
      }
    }

    if (isCredit) {
      let creditId: string;
      if (dto.creditAccountId) {
        await this.addSaleToCredit.execute(dto.creditAccountId, sale.id!, roundedTotal);
        creditId = dto.creditAccountId;
      } else {
        const credit = await this.createCreditAccount.execute(
          dto.clientId!,
          sale.id!,
          roundedTotal,
          userId,
          dto.creditName,
          branchId,
        );
        creditId = credit.id!;
      }
      for (const payment of paymentsData) {
        await this.registerCreditPayment.execute(creditId, {
          paymentMethodId: payment.paymentMethodId,
          amount: payment.amount,
          notes: `Abono inicial de venta ${sale.id}`,
        }, userId);
      }
    }

    return sale;
  }
}
