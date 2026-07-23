import { BadRequestException, CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BRANCH_SCOPED_KEY } from '../../common/decorators/branch-scoped.decorator';
import { BRANCH_REPOSITORY, IBranchRepository } from '../../domain/repositories/branch.repository';
import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories/user.repository';

@Injectable()
export class BranchAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(BRANCH_REPOSITORY) private readonly branches: IBranchRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const branchScoped = this.reflector.getAllAndOverride<boolean>(BRANCH_SCOPED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!branchScoped) return true;

    const request = context.switchToHttp().getRequest();
    const header = request.headers['x-branch-id'];
    const branchId = Array.isArray(header) ? header[0] : header;
    if (!branchId) throw new BadRequestException('Selecciona una sucursal para continuar');

    const branch = await this.branches.findById(branchId);
    if (!branch || !branch.isActive) throw new NotFoundException('Sucursal no disponible');

    if (request.user.role === 'ADMIN') {
      request.user.effectiveRole = 'ADMIN';
    } else {
      const user = await this.users.findById(request.user.id);
      if (!user || !user.isActive) throw new ForbiddenException('Usuario no disponible');
      const assignment = (user.branchAssignments || []).find((item) => item.branchId === branchId);
      if (!assignment) throw new ForbiddenException('No tienes acceso a esta sucursal');
      request.user.effectiveRole = assignment.role;
    }

    request.branchId = branchId;
    request.branch = branch;
    return true;
  }
}
