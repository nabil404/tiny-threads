import { ExecutionContext, Injectable, Type } from '@nestjs/common';
import { AuthGuard, IAuthGuard } from '@nestjs/passport';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import { CodedBadRequestException } from '../../common/errors/coded-exceptions';
import { buildValidationFields } from '../../common/errors/validation-field';

// Guards run before Nest's ValidationPipe, so without this the named
// passport strategy would read raw, unvalidated email/password off
// req.body directly. This validates the body against `dtoClass` first,
// so malformed/missing credentials get a clean 400 instead of reaching
// the strategy and the query underneath it.
export function createValidatedLocalAuthGuard(
  strategyName: string,
  dtoClass: Type<object>,
): Type<IAuthGuard> {
  @Injectable()
  class ValidatedLocalAuthGuard extends AuthGuard(strategyName) {
    async canActivate(context: ExecutionContext): Promise<boolean> {
      const request = context.switchToHttp().getRequest<{ body: unknown }>();
      const dto = plainToInstance(dtoClass, request.body);
      const errors = await validate(dto);
      if (errors.length > 0) {
        throw new CodedBadRequestException(
          ErrorCode.VALIDATION_FAILED,
          'Validation failed',
          {},
          buildValidationFields(errors),
        );
      }
      return super.canActivate(context) as Promise<boolean>;
    }
  }
  return ValidatedLocalAuthGuard;
}
