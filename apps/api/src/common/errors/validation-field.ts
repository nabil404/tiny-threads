import type { ValidationArguments, ValidationError } from 'class-validator';
import { ErrorCode, FieldError } from '@tiny-threads/shared';
import { CodedBadRequestException } from './coded-exceptions';

interface FieldCodeMeta {
  // May contain {paramName} placeholders resolved from `params` below.
  message: string;
  params?: (constraints: unknown[]) => Record<string, unknown>;
}

// The one place a field-level code's human message (and how its params are
// derived from the decorator's raw constraint args) is authored. Adding a
// new field(...) call site never requires writing a message by hand.
const FIELD_CODE_META: Partial<Record<ErrorCode, FieldCodeMeta>> = {
  [ErrorCode.IS_EMAIL]: { message: 'must be a valid email address' },
  [ErrorCode.IS_NOT_EMPTY]: { message: 'must not be empty' },
  [ErrorCode.IS_STRING]: { message: 'must be a string' },
  [ErrorCode.MIN_LENGTH]: {
    message: 'must be at least {min} characters',
    params: ([min]) => ({ min }),
  },
  [ErrorCode.MAX_LENGTH]: {
    message: 'must be at most {max} characters',
    params: ([max]) => ({ max }),
  },
  [ErrorCode.IS_IN]: {
    message: 'must be one of: {values}',
    params: ([values]) => ({ values: (values as unknown[]).join(', ') }),
  },
  [ErrorCode.IS_INT]: { message: 'must be an integer' },
  [ErrorCode.MIN]: {
    message: 'must be at least {min}',
    params: ([min]) => ({ min }),
  },
  [ErrorCode.MAX]: {
    message: 'must be at most {max}',
    params: ([max]) => ({ max }),
  },
  [ErrorCode.IS_BOOLEAN]: { message: 'must be a boolean' },
  [ErrorCode.IS_ARRAY]: { message: 'must be an array' },
  [ErrorCode.IS_UUID]: { message: 'must be a valid UUID' },
};

function interpolate(
  template: string,
  params: Record<string, unknown>,
): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) =>
    key in params ? String(params[key]) : `{${key}}`,
  );
}

// class-validator's ValidationError only ever exposes an already-interpolated
// message per failed rule — the raw rule argument (e.g. the 12 in
// @MinLength(12)) isn't retained anywhere else. The decorator's `message`
// option is therefore the only channel available to carry {code, params} out
// to the exceptionFactory; `field()` smuggles them out as a JSON string,
// decodeConstraintMessage (below) parses it back.
export function field(code: ErrorCode) {
  return (args: ValidationArguments): string => {
    const meta = FIELD_CODE_META[code];
    const params = meta?.params?.(args.constraints) ?? {};
    const message = meta
      ? `${args.property} ${interpolate(meta.message, params)}`
      : `${args.property} failed ${code}`;
    return JSON.stringify({ code, message, params });
  };
}

function toScreamingSnakeCase(constraintName: string): string {
  return constraintName.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
}

// Best-effort code for a constraint whose decorator was never given a
// field(...) message — a decorator someone forgets to wire up degrades to a
// generic-but-real code instead of crashing the request.
function fallbackCodeFor(constraintName: string): ErrorCode {
  const candidate = toScreamingSnakeCase(constraintName);
  return (Object.values(ErrorCode) as string[]).includes(candidate)
    ? (candidate as ErrorCode)
    : ErrorCode.VALIDATION_FAILED;
}

function decodeConstraintMessage(
  raw: string,
  constraintName: string,
): FieldError {
  try {
    return JSON.parse(raw) as FieldError;
  } catch {
    return { code: fallbackCodeFor(constraintName), message: raw, params: {} };
  }
}

// Flat DTOs only — no current DTO nests a validated object/array, so a
// property with error.children populated is out of scope until one exists.
export function buildValidationFields(
  errors: ValidationError[],
): Record<string, FieldError[]> {
  const fields: Record<string, FieldError[]> = {};
  for (const error of errors) {
    fields[error.property] = Object.entries(error.constraints ?? {}).map(
      ([constraintName, raw]) => decodeConstraintMessage(raw, constraintName),
    );
  }
  return fields;
}

export function buildValidationException(
  errors: ValidationError[],
): CodedBadRequestException {
  return new CodedBadRequestException(
    ErrorCode.VALIDATION_FAILED,
    'Validation failed',
    {},
    buildValidationFields(errors),
  );
}
