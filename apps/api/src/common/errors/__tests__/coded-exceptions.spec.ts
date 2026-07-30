import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ErrorCode } from '@tiny-threads/shared';
import {
  CodedBadRequestException,
  CodedConflictException,
  CodedForbiddenException,
  CodedNotFoundException,
  CodedUnauthorizedException,
} from '../coded-exceptions';

describe('Coded*Exception', () => {
  it.each([
    ['CodedBadRequestException', CodedBadRequestException, BadRequestException, 400],
    ['CodedUnauthorizedException', CodedUnauthorizedException, UnauthorizedException, 401],
    ['CodedForbiddenException', CodedForbiddenException, ForbiddenException, 403],
    ['CodedNotFoundException', CodedNotFoundException, NotFoundException, 404],
    ['CodedConflictException', CodedConflictException, ConflictException, 409],
  ] as const)('%s is a %s carrying code/message/params', (_name, Coded, BuiltIn, status) => {
    const error = new Coded(ErrorCode.AUTH_INVALID_CREDENTIALS, 'Invalid email or password', {
      attempt: 1,
    });

    expect(error).toBeInstanceOf(BuiltIn);
    expect(error.getStatus()).toBe(status);
    expect(error.message).toBe('Invalid email or password');
    expect(error.getResponse()).toEqual({
      code: ErrorCode.AUTH_INVALID_CREDENTIALS,
      message: 'Invalid email or password',
      params: { attempt: 1 },
    });
  });

  it('defaults params to an empty object', () => {
    const error = new CodedNotFoundException(ErrorCode.TENANT_NOT_FOUND, 'Unknown tenant');
    expect(error.getResponse()).toEqual({
      code: ErrorCode.TENANT_NOT_FOUND,
      message: 'Unknown tenant',
      params: {},
    });
  });

  it('CodedBadRequestException attaches an optional fields map', () => {
    const fields = {
      email: [{ code: ErrorCode.IS_EMAIL, message: 'email must be a valid email address', params: {} }],
    };
    const error = new CodedBadRequestException(
      ErrorCode.VALIDATION_FAILED,
      'Validation failed',
      {},
      fields,
    );
    expect(error.getResponse()).toEqual({
      code: ErrorCode.VALIDATION_FAILED,
      message: 'Validation failed',
      params: {},
      fields,
    });
  });
});
