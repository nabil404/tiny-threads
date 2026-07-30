import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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

export class CodedUnauthorizedException extends UnauthorizedException {
  constructor(code: ErrorCode, message: string, params: Record<string, unknown> = {}) {
    super({ code, message, params });
  }
}

export class CodedNotFoundException extends NotFoundException {
  constructor(code: ErrorCode, message: string, params: Record<string, unknown> = {}) {
    super({ code, message, params });
  }
}

export class CodedConflictException extends ConflictException {
  constructor(code: ErrorCode, message: string, params: Record<string, unknown> = {}) {
    super({ code, message, params });
  }
}

export class CodedForbiddenException extends ForbiddenException {
  constructor(code: ErrorCode, message: string, params: Record<string, unknown> = {}) {
    super({ code, message, params });
  }
}
