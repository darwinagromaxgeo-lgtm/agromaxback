import { Injectable, Inject, ConflictException } from '@nestjs/common';
import { IProductRepository, PRODUCT_REPOSITORY } from '../../../domain/repositories/product.repository';
import { IStockRepository, STOCK_REPOSITORY } from '../../../domain/repositories/stock.repository';
import { CreateProductDto } from '../../dtos/product/create-product.dto';
import { RecordStockMovementUseCase } from '../stock-movement/record-stock-movement.use-case';
import { StockMovementType } from '../../../domain/enums';

@Injectable()
export class CreateProductUseCase {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly productRepository: IProductRepository,
    @Inject(STOCK_REPOSITORY) private readonly stockRepository: IStockRepository,
    private readonly recordStockMovement: RecordStockMovementUseCase,
  ) {}

  async execute(dto: CreateProductDto, userId?: string) {
    const existing = await this.productRepository.findByName(dto.name);
    if (existing) throw new ConflictException(`Ya existe un producto con el nombre "${dto.name}"`);

    const product = await this.productRepository.create({
      name: dto.name, description: dto.description, categoryId: dto.categoryId,
      unit: dto.unit, activeIngredient: dto.activeIngredient,
      activeIngredients: dto.activeIngredients || [],
      taxType: dto.taxType || 'GRAVADO',
      billingEnabled: dto.billingEnabled ?? true,
      catalogStatus: dto.taxType === 'PENDIENTE' ? 'PENDING_REVIEW' : 'READY',
      prices: dto.prices || [], tracksLot: dto.tracksLot ?? false,
      location: dto.location, isActive: true,
    });

    if (dto.initialStocks && dto.initialStocks.length > 0) {
      for (const stock of dto.initialStocks) {
        if (stock.quantity > 0) {
          await this.stockRepository.upsert(product.id!, stock.companyId, stock.quantity);

          await this.recordStockMovement.execute({
            productId: product.id!,
            companyId: stock.companyId,
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
      }
    }

    return product;
  }
}
