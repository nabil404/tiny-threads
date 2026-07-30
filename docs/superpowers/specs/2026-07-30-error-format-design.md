# Error response format & field-level validation codes — design

## Problem

There is no common error shape today. `apps/api` has no global exception
filter, so every response is whatever NestJS's default `HttpException`
serialization produces: `{ statusCode, message, error }`, with `message` a
hardcoded English string (or, from the built-in `ValidationPipe`, a flat
array of English strings with no link back to which DTO field failed which
rule). ~30 call sites across `customers`, `merchant-admins`, `oauth`, guards,
and middleware throw `UnauthorizedException('Invalid email or password')`,
`NotFoundException('Unknown tenant')`, etc. — plain prose, not something a
frontend can safely match on or translate.

`apps/web` needs to render localized error messages and, for validation
failures, attribute each error to the form field it belongs to. Neither is
possible against the current shape without parsing English sentences.

## Decision

- **The frontend owns translation.** The API never sends prose meant for
  end users — only a stable `code` plus a `params` object for interpolation
  (e.g. `{ min: 12 }`). Adding a language is a frontend-only change; no
  server-side i18n library, no locale header to thread through every
  request.
- **One envelope for every error**, produced by a single global
  `AllExceptionsFilter`, regardless of what threw:
  ```json
  { "error": { "code": "AUTH_INVALID_CREDENTIALS", "message": "Invalid email or password", "params": {} } }
  ```
  ```json
  {
    "error": {
      "code": "VALIDATION_FAILED",
      "message": "Validation failed",
      "params": {},
      "fields": {
        "email": [{ "code": "IS_EMAIL", "message": "email must be an email", "params": {} }],
        "password": [{ "code": "MIN_LENGTH", "message": "password must be at least 12 characters", "params": { "min": 12 } }]
      }
    }
  }
  ```
- **`ErrorCode` and the envelope types live in `packages/shared`**, imported
  by both `apps/api` and `apps/web`, so the two apps cannot silently drift —
  a code the API throws that isn't in the shared enum is a compile error, and
  the frontend's intl catalog is keyed off the same type.
- **Every existing throw site is retrofitted** as part of this change, not
  left for a follow-up — otherwise the frontend has to handle both the new
  envelope and the old ad-hoc shape simultaneously.

## Envelope shape — `packages/shared`

```ts
// packages/shared/src/errors/types.ts
export interface FieldError {
  code: ErrorCode;
  message: string;
  params: Record<string, unknown>;
}

export interface ErrorResponseBody {
  error: {
    code: ErrorCode;
    message: string;
    params: Record<string, unknown>;
    fields?: Record<string, FieldError[]>;
  };
}
```

```ts
// packages/shared/src/errors/error-codes.ts
export enum ErrorCode {
  // generic / fallback
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  VALIDATION_FAILED = 'VALIDATION_FAILED',

  // auth-core (shared between customers/merchant-admins)
  AUTH_INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS',
  AUTH_MISSING_REFRESH_TOKEN = 'AUTH_MISSING_REFRESH_TOKEN',
  AUTH_INVALID_REFRESH_TOKEN = 'AUTH_INVALID_REFRESH_TOKEN',
  AUTH_REFRESH_TOKEN_REUSE_DETECTED = 'AUTH_REFRESH_TOKEN_REUSE_DETECTED',
  AUTH_REFRESH_TOKEN_EXPIRED = 'AUTH_REFRESH_TOKEN_EXPIRED',
  AUTH_WRONG_TOKEN_AUDIENCE = 'AUTH_WRONG_TOKEN_AUDIENCE',
  AUTH_TOKEN_TENANT_MISMATCH = 'AUTH_TOKEN_TENANT_MISMATCH',
  AUTH_INSUFFICIENT_ROLE = 'AUTH_INSUFFICIENT_ROLE',

  // customers
  CUSTOMER_EMAIL_ALREADY_REGISTERED = 'CUSTOMER_EMAIL_ALREADY_REGISTERED',
  CUSTOMER_VERIFICATION_TOKEN_INVALID = 'CUSTOMER_VERIFICATION_TOKEN_INVALID',
  CUSTOMER_PASSWORD_RESET_TOKEN_INVALID = 'CUSTOMER_PASSWORD_RESET_TOKEN_INVALID',

  // merchant-admins
  MERCHANT_ADMIN_EMAIL_ALREADY_REGISTERED = 'MERCHANT_ADMIN_EMAIL_ALREADY_REGISTERED',
  MERCHANT_ADMIN_INVITE_TOKEN_INVALID = 'MERCHANT_ADMIN_INVITE_TOKEN_INVALID',
  MERCHANT_ADMIN_VERIFICATION_TOKEN_INVALID = 'MERCHANT_ADMIN_VERIFICATION_TOKEN_INVALID',
  MERCHANT_ADMIN_PASSWORD_RESET_TOKEN_INVALID = 'MERCHANT_ADMIN_PASSWORD_RESET_TOKEN_INVALID',
  MERCHANT_ADMIN_NO_LONGER_EXISTS = 'MERCHANT_ADMIN_NO_LONGER_EXISTS',

  // oauth
  OAUTH_INVALID_STATE = 'OAUTH_INVALID_STATE',
  OAUTH_INVALID_OR_EXPIRED_CODE = 'OAUTH_INVALID_OR_EXPIRED_CODE',
  OAUTH_MISSING_ID_TOKEN = 'OAUTH_MISSING_ID_TOKEN',
  OAUTH_INVALID_ID_TOKEN_PAYLOAD = 'OAUTH_INVALID_ID_TOKEN_PAYLOAD',
  OAUTH_UNSUPPORTED_POPULATION = 'OAUTH_UNSUPPORTED_POPULATION',

  // tenancy / common
  TENANT_NOT_FOUND = 'TENANT_NOT_FOUND',
  INVALID_RETURN_URL = 'INVALID_RETURN_URL',

  // field-level validation (class-validator constraint name, uppercased snake_case)
  IS_EMAIL = 'IS_EMAIL',
  IS_NOT_EMPTY = 'IS_NOT_EMPTY',
  IS_STRING = 'IS_STRING',
  MIN_LENGTH = 'MIN_LENGTH',
  // extended with more field-level codes as new class-validator decorators
  // are used; the exceptionFactory fallback (see below) covers any not yet
  // added here so a missed enum entry never crashes a request.
}
```

This enum is not exhaustive of every future code — new domain codes are
added here the same way a new DTO field is added to a class; nothing else in
this doc depends on the list being complete on day one.

## Throwing coded errors — `apps/api/src/common/errors/`

```ts
// coded-exceptions.ts
export abstract class CodedHttpException extends HttpException {
  protected constructor(
    status: number,
    code: ErrorCode,
    message: string,
    params: Record<string, unknown> = {},
    fields?: Record<string, FieldError[]>,
  ) {
    super({ code, message, params, ...(fields ? { fields } : {}) }, status);
  }
}

export class CodedBadRequestException extends CodedHttpException {
  constructor(
    code: ErrorCode,
    message: string,
    params: Record<string, unknown> = {},
    fields?: Record<string, FieldError[]>,
  ) {
    super(HttpStatus.BAD_REQUEST, code, message, params, fields);
  }
}
// CodedUnauthorizedException, CodedNotFoundException, CodedConflictException,
// CodedForbiddenException follow the same pattern (no `fields` param — only
// validation produces field-level errors).
```

Retrofit is mechanical, one call site at a time:

```diff
- throw new UnauthorizedException('Invalid email or password');
+ throw new CodedUnauthorizedException(ErrorCode.AUTH_INVALID_CREDENTIALS, 'Invalid email or password');
```

Domains and representative call sites covered by this retrofit:

| Domain | Files | Representative codes |
|---|---|---|
| Auth (shared) | `customers/strategies/customer-jwt.strategy.ts`, `merchant-admins/strategies/merchant-admin-jwt.strategy.ts`, `merchant-admins/guards/roles.guard.ts`, both `*-auth.service.ts` login/refresh paths | `AUTH_INVALID_CREDENTIALS`, `AUTH_MISSING_REFRESH_TOKEN`, `AUTH_INVALID_REFRESH_TOKEN`, `AUTH_REFRESH_TOKEN_REUSE_DETECTED`, `AUTH_REFRESH_TOKEN_EXPIRED`, `AUTH_WRONG_TOKEN_AUDIENCE`, `AUTH_TOKEN_TENANT_MISMATCH`, `AUTH_INSUFFICIENT_ROLE` |
| Customers | `customers/customers-auth.service.ts` | `CUSTOMER_EMAIL_ALREADY_REGISTERED`, `CUSTOMER_VERIFICATION_TOKEN_INVALID`, `CUSTOMER_PASSWORD_RESET_TOKEN_INVALID` |
| Merchant admins | `merchant-admins/merchant-admins-auth.service.ts` | `MERCHANT_ADMIN_EMAIL_ALREADY_REGISTERED`, `MERCHANT_ADMIN_INVITE_TOKEN_INVALID`, `MERCHANT_ADMIN_VERIFICATION_TOKEN_INVALID`, `MERCHANT_ADMIN_PASSWORD_RESET_TOKEN_INVALID`, `MERCHANT_ADMIN_NO_LONGER_EXISTS` |
| OAuth | `oauth/google-oauth.controller.ts`, `auth-core/services/oauth-state.service.ts`, both `*-auth.controller.ts` one-time-code exchange | `OAUTH_INVALID_STATE`, `OAUTH_INVALID_OR_EXPIRED_CODE`, `OAUTH_MISSING_ID_TOKEN`, `OAUTH_INVALID_ID_TOKEN_PAYLOAD`, `OAUTH_UNSUPPORTED_POPULATION` |
| Tenancy / common | `common/middleware/tenant-resolution.middleware.ts`, `common/utils/return-url.ts` | `TENANT_NOT_FOUND`, `INVALID_RETURN_URL` |

The exact code assigned to each of the ~30 individual call sites (some
services throw the same conceptual error from more than one place, e.g.
"email already registered" in both `register()` and the OAuth
account-linking path) is a mechanical implementation detail, not spelled out
line-by-line here.

## Global exception filter

```ts
// all-exceptions.filter.ts
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (isCodedErrorBody(body)) {
        return res.status(status).json({ error: body });
      }
      // framework/library-thrown HttpException we haven't retrofitted
      return res.status(status).json({
        error: { code: `HTTP_${status}`, message: exception.message, params: {} },
      });
    }

    // unexpected error — log full detail server-side, never leak it
    this.logger.error(exception);
    return res.status(500).json({
      error: { code: ErrorCode.INTERNAL_SERVER_ERROR, message: 'Internal server error', params: {} },
    });
  }
}
```

Registered globally in `main.ts` via `app.useGlobalFilters(new AllExceptionsFilter())`.

## Validation field-level decoding

class-validator's `ValidationError` only exposes a pre-interpolated message
per failed rule (`constraints: { minLength: "password must be longer than
or equal to 12 characters" }`) — the raw rule argument (`12`) isn't
retained anywhere else on the error object. The decorator's `message`
option is therefore the only channel available to carry
`{code, message, params}` from the DTO to the exception factory:

```ts
// validation-field.ts
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
  [ErrorCode.IS_IN]: {
    message: 'must be one of: {values}',
    params: ([values]) => ({ values: (values as unknown[]).join(', ') }),
  },
};

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
```

```ts
// DTO usage
export class RegisterCustomerDto {
  @IsEmail(undefined, { message: field(ErrorCode.IS_EMAIL) })
  email!: string;

  @MinLength(12, { message: field(ErrorCode.MIN_LENGTH) })
  password!: string;

  @IsString({ message: field(ErrorCode.IS_STRING) })
  @IsNotEmpty({ message: field(ErrorCode.IS_NOT_EMPTY) })
  name!: string;
}
```

`buildValidationException`, wired into the global `ValidationPipe`'s
`exceptionFactory` in `main.ts` (Task 5):

```ts
function decodeConstraintMessage(raw: string, constraintName: string): FieldError {
  try {
    return JSON.parse(raw) as FieldError;
  } catch {
    // a decorator was added without field(...) — degrade instead of crashing
    return { code: fallbackCodeFor(constraintName), message: raw, params: {} };
  }
}

export function buildValidationFields(errors: ValidationError[]): Record<string, FieldError[]> {
  const fields: Record<string, FieldError[]> = {};
  for (const error of errors) {
    fields[error.property] = Object.entries(error.constraints ?? {}).map(([constraintName, raw]) =>
      decodeConstraintMessage(raw, constraintName),
    );
  }
  return fields;
}

export function buildValidationException(errors: ValidationError[]): CodedBadRequestException {
  return new CodedBadRequestException(ErrorCode.VALIDATION_FAILED, 'Validation failed', {}, buildValidationFields(errors));
}
```

`fallbackCodeFor` derives a best-effort code from the class-validator
constraint name (e.g. `minLength` → `MIN_LENGTH`) so a decorator someone
forgets to wire up still produces a usable, if param-less, field error
instead of an unhandled exception.

## Frontend contract

`apps/web` has no code yet beyond the `create-next-app` scaffold, so this
defines the contract for whenever auth/storefront UI is built, not a
concrete integration:

- Read `error.code`; look it up in the frontend's intl catalog (keyed by
  the shared `ErrorCode` type, so an unmapped code fails to compile).
  Interpolate `error.params` into the resolved template.
- For `VALIDATION_FAILED`, additionally walk `error.fields[fieldName]` and
  render each field's first (or all) decoded error against that form
  control.
- Any `error.code` the catalog doesn't recognize (e.g. an API/frontend
  deploy skew) falls back to one generic "Something went wrong" message —
  never render `error.message` directly to an end user, since it's an
  English fallback for logs/API consumers, not translated text.

## Testing

- Unit tests for `AllExceptionsFilter`: coded `HttpException`, uncoded
  `HttpException` (fallback `HTTP_<status>`), and a non-`HttpException`
  (fallback `INTERNAL_SERVER_ERROR`, confirms no leak of the original
  message).
- Unit tests for the validation `exceptionFactory` / `decode`: correct
  `fields` map for a multi-field, multi-rule DTO; the `JSON.parse` failure
  fallback path.
- One e2e test per auth module (`customers`, `merchant-admins`) asserting
  the envelope shape end-to-end: a validation failure (`POST register` with
  a short password) and a real domain error (login with a wrong password),
  following the existing `__tests__` / e2e conventions.

## Out of scope

- Wiring an actual intl library into `apps/web` — that app is still the
  `create-next-app` scaffold; this design only fixes the contract it will
  consume.
- A `requestId`/trace-correlation field on the envelope — not needed until
  there's a support/observability workflow that consumes it; adding it
  later is a non-breaking, additive change to `ErrorResponseBody`.
- Nested/array DTO field paths (e.g. `items[0].sku`) — no current DTO has
  nested validation; `buildValidationFields` handles the flat case only
  until one exists.
- Retrofitting non-auth modules — none exist yet (see CLAUDE.md: domain
  modules like products/orders aren't built). Every new module written
  after this lands uses `Coded*Exception` and `field(...)` from the start.
