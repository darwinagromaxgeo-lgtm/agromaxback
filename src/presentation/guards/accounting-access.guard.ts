import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ACCOUNTING_PASSWORD_KEY, ACCOUNTING_READ_KEY } from '../../common/decorators/accounting-access.decorator';

@Injectable()
export class AccountingAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>('isPublic', targets)) return true;
    const request = context.switchToHttp().getRequest();
    // SellerAccessGuard refreshes the account role, BranchAccessGuard resolves its branch role.
    if (request.user?.role !== 'CONTABILIDAD' && request.user?.effectiveRole !== 'CONTABILIDAD') return true;
    if (['GET', 'HEAD'].includes(request.method) && this.reflector.getAllAndOverride<boolean>(ACCOUNTING_READ_KEY, targets)) return true;
    if (request.method === 'PATCH' && request.params?.id === request.user.id
      && this.reflector.getAllAndOverride<boolean>(ACCOUNTING_PASSWORD_KEY, targets)) return true;
    throw new ForbiddenException('El perfil Contabilidad permite consultar y descargar información, sin modificar operaciones');
  }
}
