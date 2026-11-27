import { Injectable, Inject, ConflictException, BadRequestException } from '@nestjs/common';
import { IProductRepository, PRODUCT_REPOSITORY } from '../../../domain/repositories/product.repository';
import { IStockRepository, STOCK_REPOSITORY } from '../../../domain/repositories/stock.repository';
import { CreateProductDto } from '../../dtos/product/create-product.dto';
import { RecordStockMovementUseCase } from '../stock-movement/record-stock-movement.use-case';
import { StockMovementType } from '../../../domain/enums';
import { BranchEntity } from '../../../domain/entities/branch.entity';
import { ProductEntity } from '../../../domain/entities/product.entity';
import { COMPANY_REPOSITORY, ICompanyRepository } from '../../../domain/repositories/company.repository';

@Injectable()
export class CreateProductUseCase {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly productRepository: IProductRepository,
    @Inject(STOCK_REPOSITORY) private readonly stockRepository: IStockRepository,
    private readonly recordStockMovement: RecordStockMovementUseCase,
    @Inject(COMPANY_REPOSITORY) private readonly companyRepository: ICompanyRepository,
  ) {}

  async execute(dto: CreateProductDto, userId: string, branch: BranchEntity) {
    if (!branch?.id) throw new BadRequestException('Selecciona una sucursal para continuar');
    const existing = await this.productRepository.findByName(dto.name);
    if (existing) throw new ConflictException(`Ya existe un producto con el nombre "${dto.name}"`);

    const initialStocks = (dto.initialStocks || []).map(stock => ({ ...stock, companyId: stock.companyId.toLowerCase() }));
    const seenCompanies = new Set<string>();
    for (const stock of initialStocks) {
      if (seenCompanies.has(stock.companyId)) throw new BadRequestException('No repitas la empresa en el stock inicial');
      seenCompanies.add(stock.companyId);
      if (!branch.companyIds.includes(stock.companyId)) throw new BadRequestException('La empresa del stock inicial no pertenece a la sucursal seleccionada');
      const company = await this.companyRepository.findById(stock.companyId);
      if (!company?.isActive) throw new BadRequestException('La empresa del stock inicial no está disponible');
    }

    const data: ProductEntity = {
      name: dto.name, description: dto.description, categoryId: dto.categoryId,
      unit: dto.unit, activeIngredient: dto.activeIngredient,
      activeIngredients: dto.activeIngredients || [],
      taxType: dto.taxType || 'GRAVADO',
      billingEnabled: dto.billingEnabled ?? true,
      catalogStatus: dto.taxType === 'PENDIENTE' ? 'PENDING_REVIEW' : 'READY',
      prices: dto.prices || [], tracksLot: dto.tracksLot ?? false,
      location: dto.location, isActive: true,
    };

    const positiveStocks = initialStocks.filter(stock => stock.quantity > 0);
    if (!positiveStocks.length) return this.productRepository.create(data);

    return this.productRepository.createWithEffects(data, async product => {
      for (const stock of positiveStocks) {
        await this.stockRepository.upsert(product.id!, stock.companyId, stock.quantity, branch.id);

        await this.recordStockMovement.execute({
          productId: product.id!,
          companyId: stock.companyId,
          branchId: branch.id,
          movementType: StockMovementType.ADJUSTMENT_IN,
          quantity: stock.quantity,
          previousStock: 0,
          newStock: stock.quantity,
          referenceId: product.id!,
          referenceType: 'InitialStock',
          description: 'Stock inicial al crear producto',
          userId,
          date: new Date(),
        });
      }
    });
  }
}
