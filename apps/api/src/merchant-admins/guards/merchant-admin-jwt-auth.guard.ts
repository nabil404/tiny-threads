import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ErrorCode } from '@tiny-threads/shared';
import { CodedUnauthorizedException } from '../../common/errors/coded-exceptions';

@Injectable()
export class MerchantAdminJwtAuthGuard extends AuthGuard(
  'merchant-admin-jwt',
) {
  handleRequest<TUser>(err: unknown, user: TUser): TUser {
    if (err || !user) {
      throw new CodedUnauthorizedException(
        ErrorCode.AUTH_INVALID_ACCESS_TOKEN,
        'Invalid or expired access token',
      );
    }
    return user;
  }
}
