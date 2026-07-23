import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { runWithBranch } from '../../common/branch/branch-context';

@Injectable()
export class BranchContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    return runWithBranch(request.branchId, () => next.handle());
  }
}
