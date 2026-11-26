import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { BRANCH_TRANSFER_REPOSITORY, IBranchTransferRepository } from '../../../domain/repositories/branch-transfer.repository';
import { CreateBranchTransferDto, FilterBranchTransfersDto } from '../../dtos/stock/branch-transfer.dto';
import { BRANCH_REPOSITORY, IBranchRepository } from '../../../domain/repositories/branch.repository';

@Injectable()
export class DirectBranchTransferUseCase {
  constructor(
    @Inject(BRANCH_TRANSFER_REPOSITORY) private readonly transfers: IBranchTransferRepository,
    @Inject(BRANCH_REPOSITORY) private readonly branches: IBranchRepository,
  ) {}
  private assertAccess(role: string, canTransferStock: boolean, branchId?: string) {
    if (role !== 'ADMIN' && !(role === 'VENDEDOR' && canTransferStock === true && branchId)) {
      throw new ForbiddenException('No tienes permiso para gestionar transferencias entre sucursales');
    }
  }
  execute(dto: CreateBranchTransferDto, userId: string, role: string, canTransferStock = false, branchId?: string) {
    this.assertAccess(role, canTransferStock, branchId);
    if (role !== 'ADMIN' && dto.fromBranchId !== branchId) throw new ForbiddenException('El origen debe ser tu sucursal seleccionada');
    if (dto.fromBranchId === dto.toBranchId) throw new BadRequestException('Elige sucursales de origen y destino diferentes');
    if (!dto.items.length || dto.items.length > 100 || dto.items.some(item => !Number.isFinite(item.quantity) || item.quantity < .000001 || item.quantity > 1_000_000_000 || Math.abs(Math.round(item.quantity * 1_000_000) / 1_000_000 - item.quantity) > 1e-10)) throw new BadRequestException('Indica productos con cantidades positivas de hasta seis decimales');
    if (new Set(dto.items.map(item => item.productId)).size !== dto.items.length) throw new BadRequestException('No repitas productos en la transferencia');
    return this.transfers.transfer({ ...dto, notes: dto.notes?.trim() || undefined }, userId);
  }
  list(filter: FilterBranchTransfersDto, role: string, canTransferStock = false, branchId?: string) {
    this.assertAccess(role, canTransferStock, branchId);
    if (role !== 'ADMIN' && filter.branchId && filter.branchId !== branchId) throw new ForbiddenException('Solo puedes consultar transferencias de tu sucursal seleccionada');
    return this.transfers.findAll(role === 'ADMIN' ? filter.branchId : branchId, filter.page, filter.limit);
  }
  async findByRequest(requestId: string, userId: string, role: string, canTransferStock = false, branchId?: string) {
    this.assertAccess(role, canTransferStock, branchId);
    const transfer = await this.transfers.findByRequest(requestId, userId);
    if (role !== 'ADMIN' && transfer && transfer.fromBranchId !== branchId) throw new ForbiddenException('El envío pertenece a otra sucursal de origen');
    return transfer;
  }
  async options(role: string, canTransferStock: boolean, branchId: string) {
    this.assertAccess(role, canTransferStock, branchId);
    const branches = (await this.branches.findAll(true)).map(branch => ({
      id: branch.id!, name: branch.name, code: branch.code, isActive: branch.isActive, companyIds: branch.companyIds,
    }));
    return { branches, sourceBranchIds: role === 'ADMIN' ? branches.map(branch => branch.id) : [branchId] };
  }
}
