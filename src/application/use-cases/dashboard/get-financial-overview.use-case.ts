import { Injectable, Inject } from '@nestjs/common';
import { ICashRegisterRepository, CASH_REGISTER_REPOSITORY } from '../../../domain/repositories/cash-register.repository';
import { IAccountPayableRepository, ACCOUNT_PAYABLE_REPOSITORY } from '../../../domain/repositories/account-payable.repository';
import { IStockRepository, STOCK_REPOSITORY } from '../../../domain/repositories/stock.repository';
import { IProductRepository, PRODUCT_REPOSITORY } from '../../../domain/repositories/product.repository';
import { ICreditAccountRepository, CREDIT_ACCOUNT_REPOSITORY } from '../../../domain/repositories/credit-account.repository';
import { IProductLotRepository, PRODUCT_LOT_REPOSITORY } from '../../../domain/repositories/product-lot.repository';

@Injectable()
export class GetFinancialOverviewUseCase {
  constructor(
    @Inject(CASH_REGISTER_REPOSITORY) private readonly cashRegisterRepo: ICashRegisterRepository,
    @Inject(ACCOUNT_PAYABLE_REPOSITORY) private readonly apRepo: IAccountPayableRepository,
    @Inject(STOCK_REPOSITORY) private readonly stockRepo: IStockRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly productRepo: IProductRepository,
    @Inject(CREDIT_ACCOUNT_REPOSITORY) private readonly creditRepo: ICreditAccountRepository,
    @Inject(PRODUCT_LOT_REPOSITORY) private readonly lotRepo: IProductLotRepository,
  ) {}

  async execute() {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const startDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
    const endDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    // Monthly income from cash register
    const { data: registers } = await this.cashRegisterRepo.findAll({ startDate, endDate }, 1, 100);
    let income = 0;
    for (const reg of registers) {
      income += reg.entries
        .filter((e) => !e.isDeleted && e.type === 'INCOME')
        .reduce((s, e) => s + e.amount, 0);
    }

    // All non-paid AP totals (split PEN/USD)
    const { data: allAps } = await this.apRepo.findAll(undefined, 1, 5000);
    let apPen = 0;
    let apUsd = 0;
    for (const ap of allAps) {
      if (ap.status === 'PAID') continue;
      if ((ap as any).currency === 'USD') apUsd += ap.pendingAmount;
      else apPen += ap.pendingAmount;
    }

    // Stock value: qty × lowest non-zero price per product
    const [allStocks, { data: products }, expiredLots] = await Promise.all([
      this.stockRepo.findAll(),
      this.productRepo.findAll({}, 1, 5000),
      this.lotRepo.findExpiredWithStock(),
    ]);
    const productPriceMap: Record<string, number> = {};
    for (const p of products) {
      if (!p.id) continue;
      const prices = p.prices.filter((pp) => pp.price > 0).map((pp) => pp.price);
      if (prices.length > 0) productPriceMap[p.id] = Math.min(...prices);
    }
    let stockValue = 0;
    for (const s of allStocks) {
      stockValue += s.quantity * (productPriceMap[s.productId] ?? 0);
    }
    let expiredStockValue = 0;
    for (const lot of expiredLots) {
      expiredStockValue += lot.currentQuantity * (productPriceMap[lot.productId] ?? 0);
    }

    // All pending/partial credits
    const { data: credits } = await this.creditRepo.findAll(undefined, 1, 5000);
    let creditTotal = 0;
    for (const c of credits) {
      if (c.status !== 'PAID') creditTotal += c.pendingAmount;
    }

    return {
      income: Math.round(income * 100) / 100,
      accountsPayable: {
        pen: Math.round(apPen * 100) / 100,
        usd: Math.round(apUsd * 100) / 100,
      },
      stockValue: Math.round(stockValue * 100) / 100,
      expiredStockValue: Math.round(expiredStockValue * 100) / 100,
      credits: Math.round(creditTotal * 100) / 100,
    };
  }
}
