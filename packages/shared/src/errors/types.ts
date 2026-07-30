import { ErrorCode } from './error-codes';

export interface FieldError {
  code: ErrorCode;
  message: string;
  params: Record<string, unknown>;
}

export interface ErrorResponseBody {
  error: {
    code: ErrorCode | `HTTP_${number}`;
    message: string;
    params: Record<string, unknown>;
    fields?: Record<string, FieldError[]>;
  };
}
