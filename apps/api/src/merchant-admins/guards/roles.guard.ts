import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@tiny-threads/shared';
import { CodedForbiddenException } from '../../common/errors/coded-exceptions';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<
      string[] | undefined
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }
    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: { role?: string } }>();
    if (!user?.role || !requiredRoles.includes(user.role)) {
      throw new CodedForbiddenException(
        ErrorCode.AUTH_INSUFFICIENT_ROLE,
        'Insufficient role for this action',
      );
    }
    return true;
  }
}
