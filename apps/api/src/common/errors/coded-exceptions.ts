import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ErrorCode, FieldError } from '@tiny-threads/shared';

export class CodedBadRequestException extends BadRequestException {
  constructor(
    code: ErrorCode,
    message: string,
    params: Record<string, unknown> = {},
    fields?: Record<string, FieldError[]>,
  ) {
    super({ code, message, params, ...(fields ? { fields } : {}) });
  }
}

type CodedExceptionCtor = new (
  code: ErrorCode,
  message: string,
  params?: Record<string, unknown>,
) => HttpException;

function codedException(
  Base: new (response: object) => HttpException,
): CodedExceptionCtor {
  return class extends Base {
    constructor(
      code: ErrorCode,
      message: string,
      params: Record<string, unknown> = {},
    ) {
      super({ code, message, params });
    }
  };
}

export class CodedUnauthorizedException extends codedException(
  UnauthorizedException,
) {}

export class CodedNotFoundException extends codedException(NotFoundException) {}

export class CodedConflictException extends codedException(ConflictException) {}

export class CodedForbiddenException extends codedException(
  ForbiddenException,
) {}
