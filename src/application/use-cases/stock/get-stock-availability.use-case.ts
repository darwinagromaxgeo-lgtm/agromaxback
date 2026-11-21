import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { BRANCH_REPOSITORY, IBranchRepository } from '../../../domain/repositories/branch.repository';
import { PRODUCT_REPOSITORY, IProductRepository } from '../../../domain/repositories/product.repository';
import { STOCK_REPOSITORY, IStockRepository } from '../../../domain/repositories/stock.repository';
import { BranchEntity } from '../../../domain/entities/branch.entity';

@Injectable()
export class GetStockAvailabilityUseCase {
  constructor(
    @Inject(BRANCH_REPOSITORY) private readonly branches: IBranchRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly products: IProductRepository,
    @Inject(STOCK_REPOSITORY) private readonly stocks: IStockRepository,
  ) {}

  async listBranches(companyId: string, currentBranchId: string) {
    const branches = this.eligibleBranches(await this.branches.findAll(true), companyId, currentBranchId);
    return branches.map(branch => ({
      branchId: branch.id!, branchCode: branch.code, branchName: branch.name,
      isCurrent: branch.id === currentBranchId,
    }));
  }

  async execute(productId: string, companyId: string, currentBranchId: string) {
    const [product, branches, stockRows] = await Promise.all([
      this.products.findById(productId),
      this.branches.findAll(true),
      this.stocks.findAcrossBranches(productId, companyId),
    ]);
    if (!product || !product.isActive) throw new NotFoundException('Producto no disponible');

    const eligibleBranches = this.eligibleBranches(branches, companyId, currentBranchId);
    const tiers = [...new Set(product.prices.map((price) => price.priceTierId))];
    return {
      productId: product.id,
      productName: product.name,
      unit: product.unit,
      branches: eligibleBranches.map((branch) => {
        const stock = stockRows.find((row) => row.branchId === branch.id);
        return {
          branchId: branch.id,
          branchCode: branch.code,
          branchName: branch.name,
          isCurrent: branch.id === currentBranchId,
          quantity: stock?.quantity || 0,
          prices: tiers
            .map((priceTierId) => {
              const price = this.resolvePrice(product.prices, priceTierId, companyId, branch.id!);
              return price === undefined ? null : { priceTierId, price };
            })
            .filter(Boolean),
        };
      }),
    };
  }

  private eligibleBranches(branches: BranchEntity[], companyId: string, currentBranchId: string) {
    const currentBranch = branches.find((branch) => branch.id === currentBranchId && branch.isActive);
    if (!currentBranch) throw new NotFoundException('Sucursal actual no disponible');
    if (
      currentBranch.companyIds.length > 0
      && !currentBranch.companyIds.includes(companyId)
    ) {
      throw new BadRequestException('La empresa no está habilitada en la sucursal actual');
    }

    return branches.filter((branch) =>
      branch.isActive && (branch.companyIds.length === 0 || branch.companyIds.includes(companyId)),
    );
  }

  private resolvePrice(
    prices: Array<{ priceTierId: string; companyId?: string; branchId?: string; price: number }>,
    priceTierId: string,
    companyId: string,
    branchId: string,
  ): number | undefined {
    return prices.find((price) =>
      price.priceTierId === priceTierId
      && price.companyId === companyId
      && price.branchId === branchId,
    )?.price
      ?? prices.find((price) =>
        price.priceTierId === priceTierId
        && !price.companyId
        && price.branchId === branchId,
      )?.price
      ?? prices.find((price) =>
        price.priceTierId === priceTierId
        && price.companyId === companyId
        && !price.branchId,
      )?.price
      ?? prices.find((price) =>
        price.priceTierId === priceTierId
        && !price.companyId
        && !price.branchId,
      )?.price;
  }
}
