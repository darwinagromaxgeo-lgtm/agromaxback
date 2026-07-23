import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentBranch = createParamDecorator(
  (data: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return data ? request.branch?.[data] : request.branch;
  },
);
