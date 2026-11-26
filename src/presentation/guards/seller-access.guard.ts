import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SELLER_ACCESS_KEY } from '../../common/decorators/seller-access.decorator';
import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories/user.repository';

@Injectable()
export class SellerAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, @Inject(USER_REPOSITORY) private readonly users: IUserRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>('isPublic', targets)) return true;
    const request = context.switchToHttp().getRequest();
    const current = request.user?.id ? await this.users.findById(request.user.id) : null;
    if (!current || !current.isActive) throw new UnauthorizedException('La sesión ya no está disponible');
    // Permission changes take effect for existing devices as well as new logins.
    request.user.role = current.role;
    request.user.username = current.username;
    request.user.canTransferStock = current.canTransferStock === true;
    if (current.role !== 'VENDEDOR') return true;
    if (!this.reflector.getAllAndOverride<boolean>(SELLER_ACCESS_KEY, targets)) {
      throw new ForbiddenException('Esta operación no está disponible para vendedores');
    }
    return true;
  }
}
