import { Injectable, Type } from '@nestjs/common';
import { AuthGuard, IAuthGuard } from '@nestjs/passport';
import { ErrorCode } from '@tiny-threads/shared';
import { CodedUnauthorizedException } from '../../common/errors/coded-exceptions';

export interface ICodedJwtAuthGuard extends IAuthGuard {
  handleRequest<TUser>(err: unknown, user: TUser): TUser;
}

export function createCodedJwtAuthGuard(
  strategyName: string,
): Type<ICodedJwtAuthGuard> {
  @Injectable()
  class CodedJwtAuthGuard extends AuthGuard(strategyName) {
    handleRequest<TUser>(err: unknown, user: TUser): TUser {
      // A specific error thrown by the strategy's validate() (e.g. wrong
      // audience, tenant mismatch) — or a genuinely unexpected one — arrives
      // here as `err` and must be rethrown as-is, not collapsed into a generic
      // code. Passport only leaves both `err` and `user` empty for a
      // missing/expired/malformed token, which is the one case that needs a
      // code synthesized here.
      if (err instanceof Error) {
        throw err;
      }
      if (!user) {
        throw new CodedUnauthorizedException(
          ErrorCode.AUTH_INVALID_ACCESS_TOKEN,
          'Invalid or expired access token',
        );
      }
      return user;
    }
  }
  return CodedJwtAuthGuard;
}
