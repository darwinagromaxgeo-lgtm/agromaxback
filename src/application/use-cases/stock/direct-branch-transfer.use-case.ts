import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { BRANCH_TRANSFER_REPOSITORY, IBranchTransferRepository } from '../../../domain/repositories/branch-transfer.repository';
import { CreateBranchTransferDto, FilterBranchTransfersDto } from '../../dtos/stock/branch-transfer.dto';

@Injectable()
export class DirectBranchTransferUseCase {
  constructor(@Inject(BRANCH_TRANSFER_REPOSITORY) private readonly transfers: IBranchTransferRepository) {}
  private assertAdmin(role: string) {
    if (role !== 'ADMIN') throw new ForbiddenException('Solo un administrador puede gestionar transferencias directas entre sucursales');
  }
  execute(dto: CreateBranchTransferDto, userId: string, role: string) {
    this.assertAdmin(role);
    if (dto.fromBranchId === dto.toBranchId) throw new BadRequestException('Elige sucursales de origen y destino diferentes');
    if (!dto.items.length || dto.items.length > 100 || dto.items.some(item => !Number.isFinite(item.quantity) || item.quantity < .000001 || item.quantity > 1_000_000_000 || Math.abs(Math.round(item.quantity * 1_000_000) / 1_000_000 - item.quantity) > 1e-10)) throw new BadRequestException('Indica productos con cantidades positivas de hasta seis decimales');
    if (new Set(dto.items.map(item => item.productId)).size !== dto.items.length) throw new BadRequestException('No repitas productos en la transferencia');
    return this.transfers.transfer({ ...dto, notes: dto.notes?.trim() || undefined }, userId);
  }
  list(filter: FilterBranchTransfersDto, role: string) {
    this.assertAdmin(role);
    return this.transfers.findAll(filter.branchId, filter.page, filter.limit);
  }
  findByRequest(requestId: string, userId: string, role: string) {
    this.assertAdmin(role);
    return this.transfers.findByRequest(requestId, userId);
  }
}
