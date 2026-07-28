import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { runWithBranch } from '../../../common/branch/branch-context';
import { BRANCH_REPOSITORY, IBranchRepository } from '../../../domain/repositories/branch.repository';
import { PRODUCT_REPOSITORY, IProductRepository } from '../../../domain/repositories/product.repository';
import { PRODUCT_LOT_REPOSITORY, IProductLotRepository } from '../../../domain/repositories/product-lot.repository';
import {
  STOCK_REQUEST_REPOSITORY,
  IStockRequestRepository,
} from '../../../domain/repositories/stock-request.repository';
import { STOCK_REPOSITORY, IStockRepository } from '../../../domain/repositories/stock.repository';
import { StockRequestEntity, StockRequestStatus } from '../../../domain/entities/stock-request.entity';
import { StockMovementType } from '../../../domain/enums';
import { CreateStockRequestDto } from '../../dtos/stock/create-stock-request.dto';
import { RecordStockMovementUseCase } from '../stock-movement/record-stock-movement.use-case';

@Injectable()
export class ManageStockRequestsUseCase {
  constructor(
    @Inject(STOCK_REQUEST_REPOSITORY)
    private readonly requests: IStockRequestRepository,
    @Inject(STOCK_REPOSITORY)
    private readonly stocks: IStockRepository,
    @Inject(BRANCH_REPOSITORY)
    private readonly branches: IBranchRepository,
    @Inject(PRODUCT_REPOSITORY)
    private readonly products: IProductRepository,
    @Inject(PRODUCT_LOT_REPOSITORY)
    private readonly lots: IProductLotRepository,
    private readonly movements: RecordStockMovementUseCase,
  ) {}

  async create(dto: CreateStockRequestDto, userId: string, requestingBranchId: string) {
    if (dto.sourceBranchId === requestingBranchId) {
      throw new BadRequestException('Selecciona una sucursal diferente a la actual');
    }
    const [requestingBranch, sourceBranch] = await Promise.all([
      this.branches.findById(requestingBranchId),
      this.branches.findById(dto.sourceBranchId),
    ]);
    if (!requestingBranch?.isActive || !sourceBranch?.isActive) {
      throw new NotFoundException('Sucursal no disponible');
    }
    this.assertCompanyBelongsToBranch(dto.companyId, requestingBranch);
    this.assertCompanyBelongsToBranch(dto.companyId, sourceBranch);

    const uniqueProducts = new Set(dto.items.map((item) => item.productId));
    if (uniqueProducts.size !== dto.items.length) {
      throw new BadRequestException('No repitas el mismo producto en una solicitud');
    }

    for (const item of dto.items) {
      const [product, stock] = await Promise.all([
        this.products.findById(item.productId),
        runWithBranch(dto.sourceBranchId, () =>
          this.stocks.findByProductAndCompany(item.productId, dto.companyId, dto.sourceBranchId),
        ),
      ]);
      if (!product?.isActive) throw new NotFoundException('Uno de los productos no está disponible');
      if (!stock || stock.quantity < item.quantity) {
        throw new BadRequestException(
          `${product.name}: la sucursal tiene ${stock?.quantity || 0} y solicitaste ${item.quantity}`,
        );
      }
    }

    return this.requests.create({
      requestingBranchId,
      sourceBranchId: dto.sourceBranchId,
      companyId: dto.companyId,
      items: dto.items.map((item) => ({
        productId: item.productId,
        requestedQuantity: item.quantity,
      })),
      status: 'PENDING',
      notes: dto.notes?.trim(),
      requestedBy: userId,
    });
  }

  list(
    branchId: string,
    filter?: { status?: StockRequestStatus; direction?: 'incoming' | 'outgoing' },
    page = 1,
    limit = 20,
  ) {
    return this.requests.findForBranch(branchId, filter, page, limit);
  }

  async approve(id: string, branchId: string, userId: string, notes?: string) {
    const request = await this.getRelevant(id, branchId);
    this.assertSourceBranch(request, branchId);
    if (request.status !== 'PENDING') throw new ConflictException('La solicitud ya fue atendida');

    for (const item of request.items) {
      const stock = await runWithBranch(branchId, () =>
        this.stocks.findByProductAndCompany(item.productId, request.companyId, branchId),
      );
      if (!stock || stock.quantity < item.requestedQuantity) {
        throw new BadRequestException(
          `${item.productName || 'Producto'}: stock disponible ${stock?.quantity || 0}`,
        );
      }
    }
    const updated = await this.requests.update(
      id,
      {
        status: 'APPROVED',
        items: request.items.map((item) => ({
          ...item,
          approvedQuantity: item.requestedQuantity,
        })),
        reviewedBy: userId,
        reviewedAt: new Date(),
        notes: notes?.trim()
          ? [request.notes, `Aprobación: ${notes.trim()}`].filter(Boolean).join('\n')
          : request.notes,
      },
      'PENDING',
    );
    if (!updated) throw new ConflictException('La solicitud cambió de estado');
    return updated;
  }

  async reject(id: string, branchId: string, userId: string, reason: string) {
    const request = await this.getRelevant(id, branchId);
    this.assertSourceBranch(request, branchId);
    if (request.status !== 'PENDING') throw new ConflictException('La solicitud ya fue atendida');
    const updated = await this.requests.update(
      id,
      {
        status: 'REJECTED',
        rejectionReason: reason.trim(),
        reviewedBy: userId,
        reviewedAt: new Date(),
      },
      'PENDING',
    );
    if (!updated) throw new ConflictException('La solicitud cambió de estado');
    return updated;
  }

  async dispatch(id: string, branchId: string, userId: string) {
    const request = await this.getRelevant(id, branchId);
    this.assertSourceBranch(request, branchId);
    if (request.status !== 'APPROVED') {
      throw new ConflictException('La solicitud debe estar aprobada antes de despacharse');
    }

    const plans: Array<{
      productId: string;
      productName?: string;
      quantity: number;
      lots: Array<{ id: string; lotNumber: string; expirationDate?: Date; quantity: number }>;
    }> = [];

    for (const item of request.items) {
      const quantity = item.approvedQuantity || item.requestedQuantity;
      const [product, stock] = await Promise.all([
        this.products.findById(item.productId),
        runWithBranch(branchId, () =>
          this.stocks.findByProductAndCompany(item.productId, request.companyId, branchId),
        ),
      ]);
      if (!product || !stock || stock.quantity < quantity) {
        throw new BadRequestException(
          `${item.productName || 'Producto'}: stock insuficiente al despachar`,
        );
      }

      const allocations: Array<{
        id: string;
        lotNumber: string;
        expirationDate?: Date;
        quantity: number;
      }> = [];
      if (product.tracksLot) {
        const sourceLots = await runWithBranch(branchId, () =>
          this.lots.findByProductAndCompany(item.productId, request.companyId, true, branchId),
        );
        let remaining = quantity;
        for (const lot of sourceLots.filter((row) => row.currentQuantity > 0)) {
          if (remaining <= 0) break;
          const allocated = Math.min(remaining, lot.currentQuantity);
          allocations.push({
            id: lot.id!,
            lotNumber: lot.lotNumber,
            expirationDate: lot.expirationDate,
            quantity: allocated,
          });
          remaining -= allocated;
        }
        if (remaining > 0) {
          throw new BadRequestException(
            `${product.name}: los lotes disponibles no cubren la cantidad aprobada`,
          );
        }
      }
      plans.push({
        productId: item.productId,
        productName: product.name,
        quantity,
        lots: allocations,
      });
    }

    const claimed = await this.requests.update(
      id,
      { status: 'DISPATCHING' },
      'APPROVED',
    );
    if (!claimed) throw new ConflictException('La solicitud ya está siendo despachada');

    let stockWasChanged = false;
    const dispatchedAt = new Date();
    try {
      for (const plan of plans) {
        const previous = await runWithBranch(branchId, () =>
          this.stocks.findByProductAndCompany(plan.productId, request.companyId, branchId),
        );
        const updated = await this.stocks.decrementIfAvailable(
          plan.productId,
          request.companyId,
          plan.quantity,
          branchId,
        );
        if (!updated) throw new ConflictException(`${plan.productName}: el stock cambió durante el despacho`);
        stockWasChanged = true;
        for (const allocation of plan.lots) {
          await runWithBranch(branchId, () =>
            this.lots.consumeQuantity(allocation.id, allocation.quantity),
          );
        }
        await this.movements.execute({
          productId: plan.productId,
          companyId: request.companyId,
          branchId,
          movementType: StockMovementType.TRANSFER_OUT,
          quantity: plan.quantity,
          previousStock: previous?.quantity || 0,
          newStock: updated.quantity,
          referenceId: request.id,
          referenceType: 'StockRequest',
          description: `Despacho a ${request.requestingBranchName || 'sucursal solicitante'}`,
          userId,
          date: dispatchedAt,
        });
      }

      const updated = await this.requests.update(
        id,
        {
          status: 'IN_TRANSIT',
          items: request.items.map((item) => {
            const plan = plans.find((row) => row.productId === item.productId)!;
            return {
              ...item,
              approvedQuantity: plan.quantity,
              lotAllocations: plan.lots.map(({ lotNumber, expirationDate, quantity }) => ({
                lotNumber,
                expirationDate,
                quantity,
              })),
            };
          }),
          dispatchedBy: userId,
          dispatchedAt,
        },
        'DISPATCHING',
      );
      if (!updated) throw new ConflictException('La solicitud cambió de estado');
      return updated;
    } catch (error) {
      // Antes del primer descuento es seguro liberar el intento para poder reintentarlo.
      // Si ya hubo movimientos, se conserva DISPATCHING para impedir un doble despacho.
      if (!stockWasChanged) {
        await this.requests.update(id, { status: 'APPROVED' }, 'DISPATCHING');
      }
      throw error;
    }
  }

  async receive(id: string, branchId: string, userId: string) {
    const request = await this.getRelevant(id, branchId);
    this.assertRequestingBranch(request, branchId);
    if (request.status !== 'IN_TRANSIT') {
      throw new ConflictException('La solicitud todavía no fue despachada');
    }

    const claimed = await this.requests.update(
      id,
      { status: 'RECEIVING' },
      'IN_TRANSIT',
    );
    if (!claimed) throw new ConflictException('La recepción ya está siendo procesada');

    let stockWasChanged = false;
    const receivedAt = new Date();
    try {
      for (const item of request.items) {
        const quantity = item.approvedQuantity || item.requestedQuantity;
        const previous = await runWithBranch(branchId, () =>
          this.stocks.findByProductAndCompany(item.productId, request.companyId, branchId),
        );
        const updated = await runWithBranch(branchId, () =>
          this.stocks.upsert(item.productId, request.companyId, quantity, branchId),
        );
        stockWasChanged = true;

        for (const allocation of item.lotAllocations || []) {
          await runWithBranch(branchId, async () => {
            const existing = await this.lots.findByProductCompanyLot(
              item.productId,
              request.companyId,
              allocation.lotNumber,
              branchId,
            );
            if (existing) {
              await this.lots.incrementQuantity(existing.id!, allocation.quantity);
            } else {
              await this.lots.create({
                productId: item.productId,
                companyId: request.companyId,
                branchId,
                lotNumber: allocation.lotNumber,
                expirationDate: allocation.expirationDate,
                initialQuantity: allocation.quantity,
                currentQuantity: allocation.quantity,
                receivedAt,
                isActive: true,
              });
            }
          });
        }

        await this.movements.execute({
          productId: item.productId,
          companyId: request.companyId,
          branchId,
          movementType: StockMovementType.TRANSFER_IN,
          quantity,
          previousStock: previous?.quantity || 0,
          newStock: updated.quantity,
          referenceId: request.id,
          referenceType: 'StockRequest',
          description: `Recepción desde ${request.sourceBranchName || 'sucursal origen'}`,
          userId,
          date: receivedAt,
        });
      }

      const updated = await this.requests.update(
        id,
        { status: 'RECEIVED', receivedBy: userId, receivedAt },
        'RECEIVING',
      );
      if (!updated) throw new ConflictException('La solicitud cambió de estado');
      return updated;
    } catch (error) {
      if (!stockWasChanged) {
        await this.requests.update(id, { status: 'IN_TRANSIT' }, 'RECEIVING');
      }
      throw error;
    }
  }

  async cancel(id: string, branchId: string, userId: string) {
    const request = await this.getRelevant(id, branchId);
    this.assertRequestingBranch(request, branchId);
    if (request.status !== 'PENDING') {
      throw new ConflictException('Solo se pueden cancelar solicitudes pendientes');
    }
    const updated = await this.requests.update(
      id,
      { status: 'CANCELLED', cancelledBy: userId, cancelledAt: new Date() },
      'PENDING',
    );
    if (!updated) throw new ConflictException('La solicitud cambió de estado');
    return updated;
  }

  private async getRelevant(id: string, branchId: string): Promise<StockRequestEntity> {
    const request = await this.requests.findById(id);
    if (!request) throw new NotFoundException('Solicitud no encontrada');
    if (request.sourceBranchId !== branchId && request.requestingBranchId !== branchId) {
      throw new ForbiddenException('La solicitud no pertenece a esta sucursal');
    }
    return request;
  }

  private assertSourceBranch(request: StockRequestEntity, branchId: string) {
    if (request.sourceBranchId !== branchId) {
      throw new ForbiddenException('Esta acción corresponde a la sucursal de origen');
    }
  }

  private assertRequestingBranch(request: StockRequestEntity, branchId: string) {
    if (request.requestingBranchId !== branchId) {
      throw new ForbiddenException('Esta acción corresponde a la sucursal solicitante');
    }
  }

  private assertCompanyBelongsToBranch(
    companyId: string,
    branch: { companyIds: string[]; name: string },
  ) {
    if (branch.companyIds.length > 0 && !branch.companyIds.includes(companyId)) {
      throw new BadRequestException(`La empresa no está habilitada en ${branch.name}`);
    }
  }
}
