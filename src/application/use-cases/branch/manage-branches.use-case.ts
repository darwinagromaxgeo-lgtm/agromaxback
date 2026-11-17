import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { BRANCH_REPOSITORY, IBranchRepository } from '../../../domain/repositories/branch.repository';
import { IUserRepository, USER_REPOSITORY } from '../../../domain/repositories/user.repository';
import { CreateBranchDto } from '../../dtos/branch/create-branch.dto';
import { UpdateBranchDto } from '../../dtos/branch/update-branch.dto';

@Injectable()
export class ManageBranchesUseCase {
  constructor(
    @Inject(BRANCH_REPOSITORY) private readonly branches: IBranchRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
  ) {}

  async create(dto: CreateBranchDto) {
    if (await this.branches.findByCode(dto.code)) {
      throw new ConflictException('El código de sucursal ya está registrado');
    }
    this.validateDefaultCompany(dto.companyIds, dto.defaultCompanyId);
    await this.validateBillingCode(dto.billingSeriesCode);
    try { return await this.branches.create({
      code: dto.code,
      name: dto.name,
      address: dto.address,
      phone: dto.phone,
      billingSeriesCode: dto.billingSeriesCode,
      sunatEstablishmentCode: dto.sunatEstablishmentCode,
      companyIds: dto.companyIds,
      defaultCompanyId: dto.defaultCompanyId || dto.companyIds[0],
      isActive: true,
      isMain: dto.isMain || false,
    }); } catch (error: any) {
      if (error?.code === 11000) throw new ConflictException('El código de sucursal o de series ya está asignado');
      throw error;
    }
  }

  list() {
    return this.branches.findAll(false);
  }

  async accessible(userId: string, globalRole: string) {
    if (globalRole === 'ADMIN') return this.branches.findAll(true);
    const user = await this.users.findById(userId);
    const branchIds = (user?.branchAssignments || []).map((assignment) => assignment.branchId);
    return this.branches.findByIds(branchIds, true);
  }

  async update(id: string, dto: UpdateBranchDto) {
    const existing = await this.branches.findById(id);
    if (!existing) throw new NotFoundException('Sucursal no encontrada');
    if (existing.billingSeriesCode && dto.billingSeriesCode !== undefined && dto.billingSeriesCode !== existing.billingSeriesCode) {
      throw new BadRequestException('El código de series asignado se conserva para proteger la numeración fiscal');
    }
    await this.validateBillingCode(dto.billingSeriesCode, id);
    if (dto.code && dto.code.toUpperCase() !== existing.code) {
      const duplicate = await this.branches.findByCode(dto.code);
      if (duplicate && duplicate.id !== id) throw new ConflictException('El código de sucursal ya está registrado');
    }
    const companyIds = dto.companyIds || existing.companyIds;
    const defaultCompanyId = dto.defaultCompanyId || existing.defaultCompanyId;
    this.validateDefaultCompany(companyIds, defaultCompanyId);
    try {
      const updated = await this.branches.update(id, dto);
      if (!updated) throw new ConflictException('La sucursal cambió durante la edición. Actualiza sus datos');
      return updated;
    } catch (error: any) {
      if (error?.code === 11000) throw new ConflictException('El código de sucursal o de series ya está asignado');
      throw error;
    }
  }

  private async validateBillingCode(code?: string, branchId?: string) {
    if (!code) return;
    const branches = await this.branches.findAll(false);
    if (branches.some(branch => branch.billingSeriesCode === code && branch.id !== branchId)) {
      throw new ConflictException('El código de series ya pertenece a otra sucursal');
    }
  }

  private validateDefaultCompany(companyIds: string[], defaultCompanyId?: string) {
    if (defaultCompanyId && !companyIds.includes(defaultCompanyId)) {
      throw new BadRequestException('La empresa predeterminada debe pertenecer a la sucursal');
    }
  }
}
