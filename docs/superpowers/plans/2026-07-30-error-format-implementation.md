# Error Response Format Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every `apps/api` error response one JSON envelope — a stable `ErrorCode` plus `params` for intl interpolation, and a per-field `fields` map for validation errors — so `apps/web` can parse and localize any error without matching on English prose.

**Architecture:** `packages/shared` owns the `ErrorCode` enum and envelope types, imported by `apps/api` (and, later, `apps/web`). A small set of `Coded*Exception` classes (each extending the matching NestJS built-in, e.g. `CodedUnauthorizedException extends UnauthorizedException`) carry `{code, message, params}` in their response body. class-validator's per-field messages smuggle `{code, message, params}` out as a JSON string (the only channel available), decoded by a shared `buildValidationFields` helper used by both the global `ValidationPipe` and the one guard that runs validation manually. A single global `AllExceptionsFilter` normalizes anything thrown — coded, uncoded, or a raw bug — into the same envelope.

**Tech Stack:** NestJS 11, TypeScript 5.7, class-validator 0.15, class-transformer, pnpm workspaces, Jest/ts-jest, supertest.

## Global Constraints

- Full design and rationale: `docs/superpowers/specs/2026-07-30-error-format-design.md`; as-built reference: `docs/design/error-handling.md`. If any step here appears to contradict those, the design doc wins and this plan has a bug — flag it rather than silently diverging.
- `Coded*Exception` classes MUST extend the matching NestJS built-in exception (`UnauthorizedException`, `BadRequestException`, `NotFoundException`, `ConflictException`, `ForbiddenException`), not `HttpException` directly. This is a deliberate implementation choice beyond what the design doc's illustrative code showed: NestJS's `HttpException.initMessage()` reads `response.message` when the response is an object, so passing `{code, message, params}` as the response body preserves both `instanceof BuiltInException` and `.message` on every existing `.rejects.toThrow(SomeBuiltInException)` / `.rejects.toThrow('some message')` assertion already in the test suite — confirmed by inspection, zero existing spec files need edits for the retrofit itself.
- Never hand-roll a new `ErrorCode` string inline — every code used anywhere in `apps/api` must be a member of the shared `ErrorCode` enum (compiler-enforced).
- `field(code)` takes only an `ErrorCode` — no per-call-site message argument. Human-readable field messages come from the fixed `FIELD_CODE_META` table in `validation-field.ts`, keyed by code, so adding a code once is the only place a message template is authored.
- Prettier: single quotes, trailing commas everywhere (existing `.prettierrc`).

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/shared/src/errors/error-codes.ts` | `ErrorCode` enum — every code the API can throw |
| `packages/shared/src/errors/types.ts` | `FieldError`, `ErrorResponseBody` envelope types |
| `packages/shared/src/errors/index.ts` | Barrel re-export |
| `packages/shared/src/index.ts` | Package entry point (replaces the unused `ExampleShared` placeholder) |
| `apps/api/src/common/errors/coded-exceptions.ts` | `Coded*Exception` classes |
| `apps/api/src/common/errors/all-exceptions.filter.ts` | Global `@Catch()` filter — the only place a response body is written for a thrown error |
| `apps/api/src/common/errors/validation-field.ts` | `field()` encoder, `buildValidationFields`/`buildValidationException` decoder used by both the `ValidationPipe` and the local-auth guard |
| `apps/api/src/bootstrap.ts` | `configureApp(app)` — global pipe/filter/cookie wiring shared between `main.ts` and e2e tests |
| `apps/api/src/main.ts` | Modified: delegates to `configureApp` |
| `apps/api/src/auth-core/guards/validated-local-auth.guard.ts` | Modified: throws `CodedBadRequestException` with a decoded `fields` map instead of a flat message array |
| 15 DTO files under `apps/api/src/customers/dto/` and `apps/api/src/merchant-admins/dto/` | Modified: every class-validator decorator gets a `field(code)` message |
| `customers-auth.service.ts`, `customers-auth.controller.ts`, `customer-jwt.strategy.ts` | Modified: retrofitted throw sites |
| `merchant-admins-auth.service.ts`, `merchant-admins-auth.controller.ts`, `merchant-admin-jwt.strategy.ts`, `roles.guard.ts` | Modified: retrofitted throw sites |
| `google-oauth.controller.ts`, `oauth-state.service.ts` | Modified: retrofitted throw sites |
| `tenant-resolution.middleware.ts`, `common/utils/return-url.ts` | Modified: retrofitted throw sites |

---

### Task 1: `packages/shared` — `ErrorCode` enum, envelope types, and real build wiring

`packages/shared` is currently an unbuilt scaffold (`"main": "./src/index.ts"`, no `build` script) with nothing importing it. Since `ErrorCode` is used as a runtime value (`ErrorCode.AUTH_INVALID_CREDENTIALS`), not just a type, `apps/api` needs an actual compiled JS artifact to `require()` — not raw `.ts` — so this task also gives the package a real `tsc` build and wires it as a genuine dependency.

**Files:**
- Create: `packages/shared/src/errors/error-codes.ts`
- Create: `packages/shared/src/errors/types.ts`
- Create: `packages/shared/src/errors/index.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/package.json`
- Modify: `packages/shared/tsconfig.json`
- Modify: `package.json` (repo root)
- Modify: `apps/api/package.json`

**Interfaces:**
- Produces: `ErrorCode` (enum, all members below), `FieldError { code: ErrorCode; message: string; params: Record<string, unknown> }`, `ErrorResponseBody { error: { code: ErrorCode; message: string; params: Record<string, unknown>; fields?: Record<string, FieldError[]> } }` — all importable as `import { ErrorCode, FieldError, ErrorResponseBody } from '@tiny-threads/shared'`.

- [ ] **Step 1: Write the `ErrorCode` enum**

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
  CUSTOMER_GOOGLE_ALREADY_LINKED = 'CUSTOMER_GOOGLE_ALREADY_LINKED',

  // merchant admins
  MERCHANT_ADMIN_EMAIL_ALREADY_REGISTERED = 'MERCHANT_ADMIN_EMAIL_ALREADY_REGISTERED',
  MERCHANT_ADMIN_INVITE_TOKEN_INVALID = 'MERCHANT_ADMIN_INVITE_TOKEN_INVALID',
  MERCHANT_ADMIN_VERIFICATION_TOKEN_INVALID = 'MERCHANT_ADMIN_VERIFICATION_TOKEN_INVALID',
  MERCHANT_ADMIN_PASSWORD_RESET_TOKEN_INVALID = 'MERCHANT_ADMIN_PASSWORD_RESET_TOKEN_INVALID',
  MERCHANT_ADMIN_NO_LONGER_EXISTS = 'MERCHANT_ADMIN_NO_LONGER_EXISTS',
  MERCHANT_ADMIN_NOT_FOUND = 'MERCHANT_ADMIN_NOT_FOUND',
  MERCHANT_ADMIN_ROLE_TOO_HIGH = 'MERCHANT_ADMIN_ROLE_TOO_HIGH',

  // oauth
  OAUTH_INVALID_STATE = 'OAUTH_INVALID_STATE',
  OAUTH_INVALID_OR_EXPIRED_CODE = 'OAUTH_INVALID_OR_EXPIRED_CODE',
  OAUTH_MISSING_ID_TOKEN = 'OAUTH_MISSING_ID_TOKEN',
  OAUTH_INVALID_ID_TOKEN_PAYLOAD = 'OAUTH_INVALID_ID_TOKEN_PAYLOAD',
  OAUTH_UNSUPPORTED_POPULATION = 'OAUTH_UNSUPPORTED_POPULATION',

  // tenancy / common
  TENANT_NOT_FOUND = 'TENANT_NOT_FOUND',
  INVALID_RETURN_URL = 'INVALID_RETURN_URL',

  // field-level validation — named after the class-validator constraint
  // they decode, uppercased/snake-cased (see fallbackCodeFor in
  // validation-field.ts, Task 3)
  IS_EMAIL = 'IS_EMAIL',
  IS_NOT_EMPTY = 'IS_NOT_EMPTY',
  IS_STRING = 'IS_STRING',
  IS_IN = 'IS_IN',
  MIN_LENGTH = 'MIN_LENGTH',
}
```

- [ ] **Step 2: Write the envelope types**

```ts
// packages/shared/src/errors/types.ts
import { ErrorCode } from './error-codes';

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

- [ ] **Step 3: Barrel and package entry point**

```ts
// packages/shared/src/errors/index.ts
export * from './error-codes';
export * from './types';
```

```ts
// packages/shared/src/index.ts
export * from './errors';
```

(This replaces the file's current sole content, the unused `ExampleShared` type — nothing imports it.)

- [ ] **Step 4: Give the package a real build**

Edit `packages/shared/package.json`:

```diff
   "main": "./src/index.ts",
   "types": "./src/index.ts",
   "scripts": {
+    "build": "tsc -p tsconfig.json",
     "lint": "eslint \"src/**/*.ts\""
   },
```

```diff
-  "main": "./src/index.ts",
-  "types": "./src/index.ts",
+  "main": "./dist/index.js",
+  "types": "./dist/index.d.ts",
```

Edit `packages/shared/tsconfig.json` — `apps/api` requires this package via plain CommonJS `require()` (its own `tsconfig.json` targets `nodenext` with no `"type": "module"`, so it emits `require` calls), so the shared package must emit CommonJS too:

```diff
   "compilerOptions": {
     "target": "ES2022",
-    "module": "ESNext",
-    "moduleResolution": "Bundler",
+    "module": "NodeNext",
+    "moduleResolution": "NodeNext",
     "strict": true,
```

- [ ] **Step 5: Auto-build on install**

`dist/` is gitignored (repo `.gitignore:6`), so a fresh clone has no compiled output until it's built once. Add a root `postinstall` so `pnpm install` always leaves `packages/shared` ready to import:

```diff
   "scripts": {
+    "postinstall": "pnpm --filter @tiny-threads/shared build",
     "dev:api": "pnpm --filter @tiny-threads/api start:dev",
```

- [ ] **Step 6: Add it as a real `apps/api` dependency**

Edit `apps/api/package.json`, in `"dependencies"` (alphabetical, next to `@nestjs/typeorm`):

```diff
   "@nestjs/typeorm": "^11.0.3",
+  "@tiny-threads/shared": "workspace:*",
   "argon2": "^0.45.1",
```

- [ ] **Step 7: Install and build**

```bash
pnpm install
pnpm --filter @tiny-threads/shared build
```

- [ ] **Step 8: Verify the package actually resolves from `apps/api`**

```bash
cd apps/api && node -e "console.log(require('@tiny-threads/shared').ErrorCode.AUTH_INVALID_CREDENTIALS)"
```

Expected: prints `AUTH_INVALID_CREDENTIALS` with no `Cannot find module` error. (Run from inside `apps/api` so Node's resolution walks up through its own `node_modules`, where pnpm symlinks the workspace package.)

- [ ] **Step 9: Commit**

```bash
git add packages/shared apps/api/package.json package.json pnpm-lock.yaml
git commit -m "feat(shared): add ErrorCode enum and error envelope types"
```

---

### Task 2: `Coded*Exception` classes

**Files:**
- Create: `apps/api/src/common/errors/coded-exceptions.ts`
- Test: `apps/api/src/common/errors/__tests__/coded-exceptions.spec.ts`

**Interfaces:**
- Consumes: `ErrorCode`, `FieldError` from `@tiny-threads/shared` (Task 1).
- Produces: `CodedBadRequestException(code, message, params?, fields?)`, `CodedUnauthorizedException(code, message, params?)`, `CodedNotFoundException(code, message, params?)`, `CodedConflictException(code, message, params?)`, `CodedForbiddenException(code, message, params?)` — each `new`-able, each an instance of both itself and the NestJS built-in it extends, each `.getResponse()` returning `{code, message, params, fields?}`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/common/errors/__tests__/coded-exceptions.spec.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/api test -- common/errors/coded-exceptions`
Expected: FAIL with "Cannot find module '../coded-exceptions'"

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/src/common/errors/coded-exceptions.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/api test -- common/errors/coded-exceptions`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/errors/coded-exceptions.ts apps/api/src/common/errors/__tests__/coded-exceptions.spec.ts
git commit -m "feat(api): add Coded*Exception classes"
```

---

### Task 3: Validation field encoding/decoding

**Files:**
- Create: `apps/api/src/common/errors/validation-field.ts`
- Test: `apps/api/src/common/errors/__tests__/validation-field.spec.ts`
- Modify: `docs/superpowers/specs/2026-07-30-error-format-design.md` (sync the `field()`/decode snippet with the final implementation)
- Modify: `docs/design/error-handling.md` (same sync)

**Interfaces:**
- Consumes: `ErrorCode`, `FieldError` from `@tiny-threads/shared`; `CodedBadRequestException` from Task 2.
- Produces: `field(code: ErrorCode): (args: ValidationArguments) => string` (used as a decorator's `message` option), `buildValidationFields(errors: ValidationError[]): Record<string, FieldError[]>`, `buildValidationException(errors: ValidationError[]): CodedBadRequestException` — the last is what gets passed as `ValidationPipe`'s `exceptionFactory` in Task 5.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/api/src/common/errors/__tests__/validation-field.spec.ts
import type { ValidationArguments, ValidationError } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import {
  buildValidationException,
  buildValidationFields,
  field,
} from '../validation-field';

function args(property: string, constraints: unknown[] = []): ValidationArguments {
  return { property, constraints } as ValidationArguments;
}

describe('field()', () => {
  it('encodes a param-less code with a human message prefixed by the property name', () => {
    const raw = field(ErrorCode.IS_EMAIL)(args('email'));
    expect(JSON.parse(raw)).toEqual({
      code: ErrorCode.IS_EMAIL,
      message: 'email must be a valid email address',
      params: {},
    });
  });

  it('encodes MIN_LENGTH with the real constraint argument as a named param', () => {
    const raw = field(ErrorCode.MIN_LENGTH)(args('password', [12]));
    expect(JSON.parse(raw)).toEqual({
      code: ErrorCode.MIN_LENGTH,
      message: 'password must be at least 12 characters',
      params: { min: 12 },
    });
  });

  it('encodes IS_IN with the allowed values joined into the message', () => {
    const raw = field(ErrorCode.IS_IN)(args('role', [['owner', 'admin']]));
    expect(JSON.parse(raw)).toEqual({
      code: ErrorCode.IS_IN,
      message: 'role must be one of: owner, admin',
      params: { values: 'owner, admin' },
    });
  });
});

describe('buildValidationFields', () => {
  it('groups decoded errors by property, preserving multiple rules on one field', () => {
    const errors = [
      {
        property: 'email',
        constraints: { isEmail: field(ErrorCode.IS_EMAIL)(args('email')) },
      },
      {
        property: 'password',
        constraints: {
          isString: field(ErrorCode.IS_STRING)(args('password')),
          minLength: field(ErrorCode.MIN_LENGTH)(args('password', [12])),
        },
      },
    ] as unknown as ValidationError[];

    expect(buildValidationFields(errors)).toEqual({
      email: [{ code: ErrorCode.IS_EMAIL, message: 'email must be a valid email address', params: {} }],
      password: [
        { code: ErrorCode.IS_STRING, message: 'password must be a string', params: {} },
        { code: ErrorCode.MIN_LENGTH, message: 'password must be at least 12 characters', params: { min: 12 } },
      ],
    });
  });

  it('degrades a constraint message that was never field()-encoded to a best-effort code', () => {
    const errors = [
      {
        property: 'email',
        constraints: { minLength: 'email must be longer than or equal to 5 characters' },
      },
    ] as unknown as ValidationError[];

    expect(buildValidationFields(errors)).toEqual({
      email: [
        {
          code: ErrorCode.MIN_LENGTH,
          message: 'email must be longer than or equal to 5 characters',
          params: {},
        },
      ],
    });
  });

  it('falls back to VALIDATION_FAILED for a constraint name with no matching code', () => {
    const errors = [
      { property: 'x', constraints: { someUnknownRule: 'x is bad' } },
    ] as unknown as ValidationError[];

    expect(buildValidationFields(errors)).toEqual({
      x: [{ code: ErrorCode.VALIDATION_FAILED, message: 'x is bad', params: {} }],
    });
  });
});

describe('buildValidationException', () => {
  it('returns a CodedBadRequestException carrying the decoded fields map', () => {
    const errors = [
      {
        property: 'email',
        constraints: { isEmail: field(ErrorCode.IS_EMAIL)(args('email')) },
      },
    ] as unknown as ValidationError[];

    const exception = buildValidationException(errors);

    expect(exception.getResponse()).toEqual({
      code: ErrorCode.VALIDATION_FAILED,
      message: 'Validation failed',
      params: {},
      fields: {
        email: [{ code: ErrorCode.IS_EMAIL, message: 'email must be a valid email address', params: {} }],
      },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @tiny-threads/api test -- common/errors/validation-field`
Expected: FAIL with "Cannot find module '../validation-field'"

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/src/common/errors/validation-field.ts
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
  [ErrorCode.IS_IN]: {
    message: 'must be one of: {values}',
    params: ([values]) => ({ values: (values as unknown[]).join(', ') }),
  },
};

function interpolate(template: string, params: Record<string, unknown>): string {
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

function decodeConstraintMessage(raw: string, constraintName: string): FieldError {
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @tiny-threads/api test -- common/errors/validation-field`
Expected: PASS (7 tests)

- [ ] **Step 5: Sync the design docs' code sketch with the final implementation**

Both `docs/superpowers/specs/2026-07-30-error-format-design.md` and `docs/design/error-handling.md` show an earlier, slightly wrong sketch where the decoded `message` was the raw JSON string rather than human text, and `field()` took no code-to-message mapping. Replace the `## Validation field-level decoding` code sample in the spec (and the equivalent paragraph in the design reference) with the `field()`/`FIELD_CODE_META`/`decodeConstraintMessage` shape actually implemented above, so the docs match shipped code.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/common/errors/validation-field.ts apps/api/src/common/errors/__tests__/validation-field.spec.ts docs/superpowers/specs/2026-07-30-error-format-design.md docs/design/error-handling.md
git commit -m "feat(api): decode class-validator messages into coded field errors"
```

---

### Task 4: `AllExceptionsFilter`

**Files:**
- Create: `apps/api/src/common/errors/all-exceptions.filter.ts`
- Test: `apps/api/src/common/errors/__tests__/all-exceptions.filter.spec.ts`

**Interfaces:**
- Consumes: `ErrorCode` from `@tiny-threads/shared`; `CodedUnauthorizedException` from Task 2 (used only in the test, to exercise the "coded" branch).
- Produces: `AllExceptionsFilter` (NestJS `ExceptionFilter`, `@Catch()`), wired globally in Task 5.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/api/src/common/errors/__tests__/all-exceptions.filter.spec.ts
import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { ErrorCode } from '@tiny-threads/shared';
import { AllExceptionsFilter } from '../all-exceptions.filter';
import { CodedUnauthorizedException } from '../coded-exceptions';

function buildHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
  });

  it('passes a coded HttpException straight through, wrapped in { error }', () => {
    const { host, status, json } = buildHost();
    const exception = new CodedUnauthorizedException(
      ErrorCode.AUTH_INVALID_CREDENTIALS,
      'Invalid email or password',
    );

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
        message: 'Invalid email or password',
        params: {},
      },
    });
  });

  it('synthesizes an HTTP_<status> code for an uncoded HttpException', () => {
    const { host, status, json } = buildHost();
    const exception = new BadRequestException('plain nest message');

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'HTTP_400', message: 'plain nest message', params: {} },
    });
  });

  it('never leaks a raw error and logs it server-side instead', () => {
    const { host, status, json } = buildHost();
    const exception = new Error('db exploded with secrets');
    const logSpy = jest.spyOn(filter['logger'], 'error');

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        params: {},
      },
    });
    expect(logSpy).toHaveBeenCalled();
    expect(JSON.stringify(json.mock.calls[0])).not.toContain('db exploded with secrets');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @tiny-threads/api test -- common/errors/all-exceptions.filter`
Expected: FAIL with "Cannot find module '../all-exceptions.filter'"

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/src/common/errors/all-exceptions.filter.ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { ErrorCode, ErrorResponseBody } from '@tiny-threads/shared';

interface CodedErrorBody {
  code: ErrorCode;
  message: string;
  params: Record<string, unknown>;
  fields?: unknown;
}

function isCodedErrorBody(body: unknown): body is CodedErrorBody {
  return (
    typeof body === 'object' &&
    body !== null &&
    'code' in body &&
    'message' in body &&
    'params' in body
  );
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host
      .switchToHttp()
      .getResponse<{ status: (code: number) => { json: (body: ErrorResponseBody) => void } }>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (isCodedErrorBody(body)) {
        response.status(status).json({ error: body });
        return;
      }
      // Framework/library-thrown HttpException we haven't retrofitted (e.g.
      // Nest's own 404 for an unmatched route) — synthesize a code so the
      // envelope shape stays consistent even for paths that were missed.
      response.status(status).json({
        error: { code: `HTTP_${status}` as ErrorCode, message: exception.message, params: {} },
      });
      return;
    }

    // A genuine bug, not a modeled error — log full detail server-side, never
    // leak the real message or stack to the client.
    this.logger.error(exception instanceof Error ? exception.stack : exception);
    response.status(500).json({
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        params: {},
      },
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @tiny-threads/api test -- common/errors/all-exceptions.filter`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/errors/all-exceptions.filter.ts apps/api/src/common/errors/__tests__/all-exceptions.filter.spec.ts
git commit -m "feat(api): add global AllExceptionsFilter"
```

---

### Task 5: Wire the pipe and filter globally

**Files:**
- Create: `apps/api/src/bootstrap.ts`
- Modify: `apps/api/src/main.ts`

**Interfaces:**
- Consumes: `buildValidationException` (Task 3), `AllExceptionsFilter` (Task 4).
- Produces: `configureApp(app: INestApplication): void`, called by both `main.ts` and the e2e tests in Tasks 15–16.

- [ ] **Step 1: Extract the app configuration into a shared function**

```ts
// apps/api/src/bootstrap.ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { buildValidationException } from './common/errors/validation-field';

export function configureApp(app: INestApplication): void {
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: buildValidationException,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
}
```

- [ ] **Step 2: Use it from `main.ts`**

```diff
 import { ValidationPipe } from '@nestjs/common';
 import { NestFactory } from '@nestjs/core';
 import { ConfigService } from '@nestjs/config';
 import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
-import cookieParser from 'cookie-parser';
 import { AppModule } from './app/app.module';
 import { EnvironmentVariables, NodeEnv } from './config/env.validation';
+import { configureApp } from './bootstrap';

 async function bootstrap() {
   const app = await NestFactory.create(AppModule);
-  app.use(cookieParser());
-  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
+  configureApp(app);
   const configService =
     app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
```

(The `ValidationPipe` import in `main.ts` is now unused — remove it.)

- [ ] **Step 3: Verify nothing broke**

Run: `pnpm --filter @tiny-threads/api build`
Expected: compiles cleanly (confirms `main.ts`'s unused-import removal and the new `bootstrap.ts` type-check).

Run: `pnpm --filter @tiny-threads/api test:e2e -- app.e2e-spec`
Expected: PASS — this doesn't exercise `configureApp` yet (that e2e spec builds `AppModule` directly, not via `bootstrap()`), it just confirms the existing suite is undisturbed. Full envelope-shape proof comes from the new e2e specs in Tasks 15–16, which call `configureApp` explicitly.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/bootstrap.ts apps/api/src/main.ts
git commit -m "feat(api): wire ValidationPipe exceptionFactory and AllExceptionsFilter globally"
```

---

### Task 6: Retrofit `validated-local-auth.guard.ts`

This guard runs class-validator's `validate()` directly (it executes before Nest's `ValidationPipe`, ahead of the passport strategy), so it needs its own call into `buildValidationFields` rather than going through `exceptionFactory`.

**Files:**
- Modify: `apps/api/src/auth-core/guards/validated-local-auth.guard.ts`
- Modify: `apps/api/src/auth-core/__tests__/validated-local-auth.guard.spec.ts`

**Interfaces:**
- Consumes: `CodedBadRequestException` (Task 2), `buildValidationFields` (Task 3).

- [ ] **Step 1: Add a test for the new fields shape**

Add to the existing spec (after the "rejects a malformed email" test):

```ts
  it('attaches a decoded fields map to the thrown exception', async () => {
    const guard = new Guard();

    const error = await guard
      .canActivate(contextWithBody({ email: 'not-an-email', password: 'secret' }))
      .catch((caught: unknown) => caught);

    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'VALIDATION_FAILED',
      fields: { email: [expect.objectContaining({ code: 'IS_EMAIL' })] },
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @tiny-threads/api test -- validated-local-auth.guard`
Expected: FAIL — current implementation's `getResponse()` is a flat string array, not `{code, fields}`.

- [ ] **Step 3: Retrofit the guard**

```diff
-import {
-  BadRequestException,
-  ExecutionContext,
-  Injectable,
-  Type,
-} from '@nestjs/common';
+import { ExecutionContext, Injectable, Type } from '@nestjs/common';
 import { AuthGuard, IAuthGuard } from '@nestjs/passport';
 import { plainToInstance } from 'class-transformer';
 import { validate } from 'class-validator';
+import { ErrorCode } from '@tiny-threads/shared';
+import { CodedBadRequestException } from '../../common/errors/coded-exceptions';
+import { buildValidationFields } from '../../common/errors/validation-field';
```

```diff
       const errors = await validate(dto);
       if (errors.length > 0) {
-        throw new BadRequestException(
-          errors.flatMap((error) => Object.values(error.constraints ?? {})),
-        );
+        throw new CodedBadRequestException(
+          ErrorCode.VALIDATION_FAILED,
+          'Validation failed',
+          {},
+          buildValidationFields(errors),
+        );
       }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @tiny-threads/api test -- validated-local-auth.guard`
Expected: PASS (4 tests — the 3 pre-existing `instanceof BadRequestException` assertions still hold unchanged, since `CodedBadRequestException extends BadRequestException`)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth-core/guards/validated-local-auth.guard.ts apps/api/src/auth-core/__tests__/validated-local-auth.guard.spec.ts
git commit -m "feat(api): decode validated-local-auth-guard errors into coded fields"
```

---

### Task 7: Retrofit customers DTOs

**Files:**
- Modify: `apps/api/src/customers/dto/register-customer.dto.ts`
- Modify: `apps/api/src/customers/dto/login-customer.dto.ts`
- Modify: `apps/api/src/customers/dto/verify-customer-email.dto.ts`
- Modify: `apps/api/src/customers/dto/customer-oauth-exchange.dto.ts`
- Modify: `apps/api/src/customers/dto/request-customer-password-reset.dto.ts`
- Modify: `apps/api/src/customers/dto/customer-oauth-initiate.dto.ts`
- Modify: `apps/api/src/customers/dto/reset-customer-password.dto.ts`
- Test: `apps/api/src/customers/__tests__/dto-validation-codes.spec.ts`

**Interfaces:**
- Consumes: `field` (Task 3), `ErrorCode` from `@tiny-threads/shared`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/customers/__tests__/dto-validation-codes.spec.ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterCustomerDto } from '../dto/register-customer.dto';
import { LoginCustomerDto } from '../dto/login-customer.dto';
import { VerifyCustomerEmailDto } from '../dto/verify-customer-email.dto';
import { CustomerOAuthExchangeDto } from '../dto/customer-oauth-exchange.dto';
import { RequestCustomerPasswordResetDto } from '../dto/request-customer-password-reset.dto';
import { CustomerOAuthInitiateDto } from '../dto/customer-oauth-initiate.dto';
import { ResetCustomerPasswordDto } from '../dto/reset-customer-password.dto';

function decode(raw: string): { code: string; params: Record<string, unknown> } {
  return JSON.parse(raw);
}

describe('customers DTO validation codes', () => {
  it('RegisterCustomerDto encodes IS_EMAIL, MIN_LENGTH (with min), and IS_NOT_EMPTY', async () => {
    const dto = plainToInstance(RegisterCustomerDto, {
      email: 'not-an-email',
      password: 'short',
      name: '',
    });
    const byProperty = Object.fromEntries(
      (await validate(dto)).map((e) => [e.property, e.constraints ?? {}]),
    );

    expect(decode(byProperty.email.isEmail)).toMatchObject({ code: 'IS_EMAIL' });
    expect(decode(byProperty.password.minLength)).toMatchObject({
      code: 'MIN_LENGTH',
      params: { min: 12 },
    });
    expect(decode(byProperty.name.isNotEmpty)).toMatchObject({ code: 'IS_NOT_EMPTY' });
  });

  it('LoginCustomerDto encodes IS_EMAIL and IS_STRING', async () => {
    const dto = plainToInstance(LoginCustomerDto, { email: 'bad', password: 123 });
    const byProperty = Object.fromEntries(
      (await validate(dto)).map((e) => [e.property, e.constraints ?? {}]),
    );

    expect(decode(byProperty.email.isEmail)).toMatchObject({ code: 'IS_EMAIL' });
    expect(decode(byProperty.password.isString)).toMatchObject({ code: 'IS_STRING' });
  });

  it('VerifyCustomerEmailDto encodes IS_STRING', async () => {
    const dto = plainToInstance(VerifyCustomerEmailDto, { token: 123 });
    const [error] = await validate(dto);
    expect(decode(error.constraints!.isString)).toMatchObject({ code: 'IS_STRING' });
  });

  it('CustomerOAuthExchangeDto encodes IS_NOT_EMPTY for an empty code', async () => {
    const dto = plainToInstance(CustomerOAuthExchangeDto, { code: '' });
    const [error] = await validate(dto);
    expect(decode(error.constraints!.isNotEmpty)).toMatchObject({ code: 'IS_NOT_EMPTY' });
  });

  it('RequestCustomerPasswordResetDto encodes IS_EMAIL', async () => {
    const dto = plainToInstance(RequestCustomerPasswordResetDto, { email: 'bad' });
    const [error] = await validate(dto);
    expect(decode(error.constraints!.isEmail)).toMatchObject({ code: 'IS_EMAIL' });
  });

  it('CustomerOAuthInitiateDto encodes IS_NOT_EMPTY for an empty returnUrl', async () => {
    const dto = plainToInstance(CustomerOAuthInitiateDto, { returnUrl: '' });
    const [error] = await validate(dto);
    expect(decode(error.constraints!.isNotEmpty)).toMatchObject({ code: 'IS_NOT_EMPTY' });
  });

  it('ResetCustomerPasswordDto encodes MIN_LENGTH with the real minimum', async () => {
    const dto = plainToInstance(ResetCustomerPasswordDto, { token: 'tok', password: 'short' });
    const byProperty = Object.fromEntries(
      (await validate(dto)).map((e) => [e.property, e.constraints ?? {}]),
    );
    expect(decode(byProperty.password.minLength)).toMatchObject({
      code: 'MIN_LENGTH',
      params: { min: 12 },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/api test -- customers/__tests__/dto-validation-codes`
Expected: FAIL — `decode(...)` throws on the current plain English messages (not JSON).

- [ ] **Step 3: Retrofit each DTO**

```ts
// apps/api/src/customers/dto/register-customer.dto.ts
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

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

```ts
// apps/api/src/customers/dto/login-customer.dto.ts
import { IsEmail, IsString } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

export class LoginCustomerDto {
  @IsEmail(undefined, { message: field(ErrorCode.IS_EMAIL) })
  email!: string;

  @IsString({ message: field(ErrorCode.IS_STRING) })
  password!: string;
}
```

```ts
// apps/api/src/customers/dto/verify-customer-email.dto.ts
import { IsString } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

export class VerifyCustomerEmailDto {
  @IsString({ message: field(ErrorCode.IS_STRING) })
  token!: string;
}
```

```ts
// apps/api/src/customers/dto/customer-oauth-exchange.dto.ts
import { IsNotEmpty, IsString } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

export class CustomerOAuthExchangeDto {
  @IsString({ message: field(ErrorCode.IS_STRING) })
  @IsNotEmpty({ message: field(ErrorCode.IS_NOT_EMPTY) })
  code!: string;
}
```

```ts
// apps/api/src/customers/dto/request-customer-password-reset.dto.ts
import { IsEmail } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

export class RequestCustomerPasswordResetDto {
  @IsEmail(undefined, { message: field(ErrorCode.IS_EMAIL) })
  email!: string;
}
```

```ts
// apps/api/src/customers/dto/customer-oauth-initiate.dto.ts
import { IsNotEmpty, IsString } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

export class CustomerOAuthInitiateDto {
  @IsString({ message: field(ErrorCode.IS_STRING) })
  @IsNotEmpty({ message: field(ErrorCode.IS_NOT_EMPTY) })
  returnUrl!: string;
}
```

```ts
// apps/api/src/customers/dto/reset-customer-password.dto.ts
import { IsString, MinLength } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

export class ResetCustomerPasswordDto {
  @IsString({ message: field(ErrorCode.IS_STRING) })
  token!: string;

  @MinLength(12, { message: field(ErrorCode.MIN_LENGTH) })
  password!: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/api test -- customers/__tests__/dto-validation-codes`
Expected: PASS (7 tests)

- [ ] **Step 5: Run the full customers unit suite to confirm no regressions**

Run: `pnpm --filter @tiny-threads/api test -- customers`
Expected: PASS (message text on decorators is now a JSON string instead of English prose, but no existing customers spec asserts on decorator message text directly — only on which DTO fields are accepted/rejected via the controller/service layer, unaffected by this change)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/customers/dto apps/api/src/customers/__tests__/dto-validation-codes.spec.ts
git commit -m "feat(api): add coded field() messages to customers DTOs"
```

---

### Task 8: Retrofit merchant-admins DTOs

**Files:**
- Modify: `apps/api/src/merchant-admins/dto/login-merchant-user.dto.ts`
- Modify: `apps/api/src/merchant-admins/dto/merchant-admin-oauth-exchange.dto.ts`
- Modify: `apps/api/src/merchant-admins/dto/verify-merchant-user-email.dto.ts`
- Modify: `apps/api/src/merchant-admins/dto/register-merchant-user.dto.ts`
- Modify: `apps/api/src/merchant-admins/dto/request-merchant-user-password-reset.dto.ts`
- Modify: `apps/api/src/merchant-admins/dto/invite-member.dto.ts`
- Modify: `apps/api/src/merchant-admins/dto/merchant-admin-oauth-initiate.dto.ts`
- Modify: `apps/api/src/merchant-admins/dto/reset-merchant-user-password.dto.ts`
- Test: `apps/api/src/merchant-admins/__tests__/dto-validation-codes.spec.ts`

**Interfaces:**
- Consumes: `field` (Task 3), `ErrorCode` from `@tiny-threads/shared`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/merchant-admins/__tests__/dto-validation-codes.spec.ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginMerchantUserDto } from '../dto/login-merchant-user.dto';
import { MerchantAdminOAuthExchangeDto } from '../dto/merchant-admin-oauth-exchange.dto';
import { VerifyMerchantUserEmailDto } from '../dto/verify-merchant-user-email.dto';
import { RegisterMerchantUserDto } from '../dto/register-merchant-user.dto';
import { RequestMerchantUserPasswordResetDto } from '../dto/request-merchant-user-password-reset.dto';
import { InviteMemberDto } from '../dto/invite-member.dto';
import { MerchantAdminOAuthInitiateDto } from '../dto/merchant-admin-oauth-initiate.dto';
import { ResetMerchantUserPasswordDto } from '../dto/reset-merchant-user-password.dto';

function decode(raw: string): { code: string; params: Record<string, unknown> } {
  return JSON.parse(raw);
}

describe('merchant-admins DTO validation codes', () => {
  it('LoginMerchantUserDto encodes IS_EMAIL and IS_STRING', async () => {
    const dto = plainToInstance(LoginMerchantUserDto, { email: 'bad', password: 123 });
    const byProperty = Object.fromEntries(
      (await validate(dto)).map((e) => [e.property, e.constraints ?? {}]),
    );
    expect(decode(byProperty.email.isEmail)).toMatchObject({ code: 'IS_EMAIL' });
    expect(decode(byProperty.password.isString)).toMatchObject({ code: 'IS_STRING' });
  });

  it('MerchantAdminOAuthExchangeDto encodes IS_NOT_EMPTY for an empty code', async () => {
    const dto = plainToInstance(MerchantAdminOAuthExchangeDto, { code: '' });
    const [error] = await validate(dto);
    expect(decode(error.constraints!.isNotEmpty)).toMatchObject({ code: 'IS_NOT_EMPTY' });
  });

  it('VerifyMerchantUserEmailDto encodes IS_STRING', async () => {
    const dto = plainToInstance(VerifyMerchantUserEmailDto, { token: 123 });
    const [error] = await validate(dto);
    expect(decode(error.constraints!.isString)).toMatchObject({ code: 'IS_STRING' });
  });

  it('RegisterMerchantUserDto encodes MIN_LENGTH with the real minimum', async () => {
    const dto = plainToInstance(RegisterMerchantUserDto, { token: 'tok', password: 'short' });
    const byProperty = Object.fromEntries(
      (await validate(dto)).map((e) => [e.property, e.constraints ?? {}]),
    );
    expect(decode(byProperty.password.minLength)).toMatchObject({
      code: 'MIN_LENGTH',
      params: { min: 12 },
    });
  });

  it('RequestMerchantUserPasswordResetDto encodes IS_EMAIL', async () => {
    const dto = plainToInstance(RequestMerchantUserPasswordResetDto, { email: 'bad' });
    const [error] = await validate(dto);
    expect(decode(error.constraints!.isEmail)).toMatchObject({ code: 'IS_EMAIL' });
  });

  it('InviteMemberDto encodes IS_EMAIL and IS_IN with the allowed roles as a param', async () => {
    const dto = plainToInstance(InviteMemberDto, { email: 'bad', role: 'superadmin' });
    const byProperty = Object.fromEntries(
      (await validate(dto)).map((e) => [e.property, e.constraints ?? {}]),
    );
    expect(decode(byProperty.email.isEmail)).toMatchObject({ code: 'IS_EMAIL' });
    expect(decode(byProperty.role.isIn)).toMatchObject({
      code: 'IS_IN',
      params: { values: 'owner, admin, staff, viewer' },
    });
  });

  it('MerchantAdminOAuthInitiateDto encodes IS_NOT_EMPTY for an empty returnUrl', async () => {
    const dto = plainToInstance(MerchantAdminOAuthInitiateDto, { returnUrl: '' });
    const [error] = await validate(dto);
    expect(decode(error.constraints!.isNotEmpty)).toMatchObject({ code: 'IS_NOT_EMPTY' });
  });

  it('ResetMerchantUserPasswordDto encodes MIN_LENGTH with the real minimum', async () => {
    const dto = plainToInstance(ResetMerchantUserPasswordDto, { token: 'tok', password: 'short' });
    const byProperty = Object.fromEntries(
      (await validate(dto)).map((e) => [e.property, e.constraints ?? {}]),
    );
    expect(decode(byProperty.password.minLength)).toMatchObject({
      code: 'MIN_LENGTH',
      params: { min: 12 },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/api test -- merchant-admins/__tests__/dto-validation-codes`
Expected: FAIL — current messages are plain English, not JSON.

- [ ] **Step 3: Retrofit each DTO**

```ts
// apps/api/src/merchant-admins/dto/login-merchant-user.dto.ts
import { IsEmail, IsString } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

export class LoginMerchantUserDto {
  @IsEmail(undefined, { message: field(ErrorCode.IS_EMAIL) })
  email!: string;

  @IsString({ message: field(ErrorCode.IS_STRING) })
  password!: string;
}
```

```ts
// apps/api/src/merchant-admins/dto/merchant-admin-oauth-exchange.dto.ts
import { IsNotEmpty, IsString } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

export class MerchantAdminOAuthExchangeDto {
  @IsString({ message: field(ErrorCode.IS_STRING) })
  @IsNotEmpty({ message: field(ErrorCode.IS_NOT_EMPTY) })
  code!: string;
}
```

```ts
// apps/api/src/merchant-admins/dto/verify-merchant-user-email.dto.ts
import { IsString } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

export class VerifyMerchantUserEmailDto {
  @IsString({ message: field(ErrorCode.IS_STRING) })
  token!: string;
}
```

```ts
// apps/api/src/merchant-admins/dto/register-merchant-user.dto.ts
import { IsString, MinLength } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

// email/role are deliberately NOT part of this DTO — they're derived
// server-side from the invite record the token resolves to (see
// MerchantAdminsAuthService.register()). A public, unauthenticated
// registration endpoint must never let the caller pick their own role or
// email; the invite (issued by an existing owner/admin via
// MerchantAdminsAuthService.inviteMember()) is the only source of truth for
// both.
export class RegisterMerchantUserDto {
  @IsString({ message: field(ErrorCode.IS_STRING) })
  token!: string;

  @MinLength(12, { message: field(ErrorCode.MIN_LENGTH) })
  password!: string;
}
```

```ts
// apps/api/src/merchant-admins/dto/request-merchant-user-password-reset.dto.ts
import { IsEmail } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

export class RequestMerchantUserPasswordResetDto {
  @IsEmail(undefined, { message: field(ErrorCode.IS_EMAIL) })
  email!: string;
}
```

```ts
// apps/api/src/merchant-admins/dto/invite-member.dto.ts
import { IsEmail, IsIn } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

export class InviteMemberDto {
  @IsEmail(undefined, { message: field(ErrorCode.IS_EMAIL) })
  email!: string;

  @IsIn(['owner', 'admin', 'staff', 'viewer'], { message: field(ErrorCode.IS_IN) })
  role!: string;
}
```

```ts
// apps/api/src/merchant-admins/dto/merchant-admin-oauth-initiate.dto.ts
import { IsNotEmpty, IsString } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

// Mirrors CustomerOAuthInitiateDto. The origin of `returnUrl` is checked
// against the requesting host in the controller (see
// assertReturnUrlMatchesRequestHost) — that can't be expressed as a
// standalone class-validator rule because it depends on the request.
export class MerchantAdminOAuthInitiateDto {
  @IsString({ message: field(ErrorCode.IS_STRING) })
  @IsNotEmpty({ message: field(ErrorCode.IS_NOT_EMPTY) })
  returnUrl!: string;
}
```

```ts
// apps/api/src/merchant-admins/dto/reset-merchant-user-password.dto.ts
import { IsString, MinLength } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

export class ResetMerchantUserPasswordDto {
  @IsString({ message: field(ErrorCode.IS_STRING) })
  token!: string;

  @MinLength(12, { message: field(ErrorCode.MIN_LENGTH) })
  password!: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/api test -- merchant-admins/__tests__/dto-validation-codes`
Expected: PASS (8 tests)

- [ ] **Step 5: Run the full merchant-admins unit suite to confirm no regressions**

Run: `pnpm --filter @tiny-threads/api test -- merchant-admins`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/merchant-admins/dto apps/api/src/merchant-admins/__tests__/dto-validation-codes.spec.ts
git commit -m "feat(api): add coded field() messages to merchant-admins DTOs"
```

---

### Task 9: Retrofit `customers-auth.service.ts` throw sites

No existing spec file needs changes — every existing assertion is either `.rejects.toThrow(SomeBuiltInException)` (still passes: `Coded*Exception extends` that same built-in) or `.rejects.toThrow('exact message')` (still passes: Nest's `HttpException.initMessage()` reads `response.message`, which stays identical). Run the full spec file at the end to confirm.

**Files:**
- Modify: `apps/api/src/customers/customers-auth.service.ts`

**Interfaces:**
- Consumes: `CodedConflictException`, `CodedNotFoundException`, `CodedUnauthorizedException` (Task 2); `ErrorCode` from `@tiny-threads/shared`.

- [ ] **Step 1: Swap the import block**

```diff
-import {
-  ConflictException,
-  Inject,
-  Injectable,
-  NotFoundException,
-  UnauthorizedException,
-} from '@nestjs/common';
+import { Inject, Injectable } from '@nestjs/common';
 import { createHash, randomUUID } from 'node:crypto';
 import { ClsService } from 'nestjs-cls';
 import { IsNull } from 'typeorm';
 import type { EntityManager } from 'typeorm';
+import { ErrorCode } from '@tiny-threads/shared';
+import {
+  CodedConflictException,
+  CodedNotFoundException,
+  CodedUnauthorizedException,
+} from '../common/errors/coded-exceptions';
 import {
   Customer,
   CustomerIdentity,
```

- [ ] **Step 2: Retrofit each throw site**

```diff
         if (existing) {
-          throw new ConflictException('Email already registered');
+          throw new CodedConflictException(
+            ErrorCode.CUSTOMER_EMAIL_ALREADY_REGISTERED,
+            'Email already registered',
+          );
         }
```

```diff
       ) {
-        throw new NotFoundException('Invalid or expired verification token');
+        throw new CodedNotFoundException(
+          ErrorCode.CUSTOMER_VERIFICATION_TOKEN_INVALID,
+          'Invalid or expired verification token',
+        );
       }
```

```diff
       ) {
-        throw new UnauthorizedException('Invalid email or password');
+        throw new CodedUnauthorizedException(
+          ErrorCode.AUTH_INVALID_CREDENTIALS,
+          'Invalid email or password',
+        );
       }
```

```diff
       if (!existing) {
-        throw new UnauthorizedException('Invalid refresh token');
+        throw new CodedUnauthorizedException(
+          ErrorCode.AUTH_INVALID_REFRESH_TOKEN,
+          'Invalid refresh token',
+        );
       }
       if (existing.revokedAt) {
         // Reuse of a revoked token in this family is a theft signal: revoke
         // the whole family.
         await manager.update(
           CustomerRefreshToken,
           { familyId: existing.familyId },
           { revokedAt: new Date() },
         );
-        throw new UnauthorizedException('Refresh token reuse detected');
+        throw new CodedUnauthorizedException(
+          ErrorCode.AUTH_REFRESH_TOKEN_REUSE_DETECTED,
+          'Refresh token reuse detected',
+        );
       }
       if (existing.expiresAt < new Date()) {
-        throw new UnauthorizedException('Refresh token expired');
+        throw new CodedUnauthorizedException(
+          ErrorCode.AUTH_REFRESH_TOKEN_EXPIRED,
+          'Refresh token expired',
+        );
       }
```

```diff
       if (!revokeResult.affected) {
         await manager.update(
           CustomerRefreshToken,
           { familyId: existing.familyId },
           { revokedAt: new Date() },
         );
-        throw new UnauthorizedException('Refresh token reuse detected');
+        throw new CodedUnauthorizedException(
+          ErrorCode.AUTH_REFRESH_TOKEN_REUSE_DETECTED,
+          'Refresh token reuse detected',
+        );
       }
```

```diff
       ) {
-        throw new ConflictException(
+        throw new CodedConflictException(
+          ErrorCode.CUSTOMER_GOOGLE_ALREADY_LINKED,
           'This Google account is already linked to a different customer',
         );
       }
```

```diff
       ) {
-        throw new NotFoundException('Invalid or expired password reset token');
+        throw new CodedNotFoundException(
+          ErrorCode.CUSTOMER_PASSWORD_RESET_TOKEN_INVALID,
+          'Invalid or expired password reset token',
+        );
       }
```

- [ ] **Step 3: Verify the existing suite still passes unchanged**

Run: `pnpm --filter @tiny-threads/api test -- customers-auth.service`
Expected: PASS — same test count and assertions as before this task.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/customers/customers-auth.service.ts
git commit -m "feat(api): retrofit customers-auth.service throw sites with coded errors"
```

---

### Task 10: Retrofit `customers-auth.controller.ts` and `customer-jwt.strategy.ts`

**Files:**
- Modify: `apps/api/src/customers/customers-auth.controller.ts`
- Modify: `apps/api/src/customers/strategies/customer-jwt.strategy.ts`

**Interfaces:**
- Consumes: `CodedBadRequestException`, `CodedUnauthorizedException` (Task 2); `ErrorCode` from `@tiny-threads/shared`.

- [ ] **Step 1: Retrofit the controller**

```diff
-import {
-  BadRequestException,
-  Body,
-  Controller,
-  HttpCode,
-  Post,
-  Req,
-  Res,
-  UnauthorizedException,
-  UseGuards,
-} from '@nestjs/common';
+import { Body, Controller, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
 import { ConfigService } from '@nestjs/config';
 import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
 import { ClsService } from 'nestjs-cls';
 import type { Request, Response } from 'express';
+import { ErrorCode } from '@tiny-threads/shared';
+import {
+  CodedBadRequestException,
+  CodedUnauthorizedException,
+} from '../common/errors/coded-exceptions';
 import { OAuthStateService } from '../auth-core/services/oauth-state.service';
```

```diff
     if (!rawRefreshToken) {
-      throw new UnauthorizedException('Missing refresh token');
+      throw new CodedUnauthorizedException(
+        ErrorCode.AUTH_MISSING_REFRESH_TOKEN,
+        'Missing refresh token',
+      );
     }
```

```diff
     ) {
-      throw new BadRequestException('Invalid or expired code');
+      throw new CodedBadRequestException(
+        ErrorCode.OAUTH_INVALID_OR_EXPIRED_CODE,
+        'Invalid or expired code',
+      );
     }
```

- [ ] **Step 2: Retrofit the JWT strategy**

```diff
-import { Injectable, UnauthorizedException } from '@nestjs/common';
+import { Injectable } from '@nestjs/common';
 import { PassportStrategy } from '@nestjs/passport';
 import { ConfigService } from '@nestjs/config';
 import { ClsService } from 'nestjs-cls';
 import { ExtractJwt, Strategy } from 'passport-jwt';
+import { ErrorCode } from '@tiny-threads/shared';
+import { CodedUnauthorizedException } from '../../common/errors/coded-exceptions';
 import { AccessTokenPayload } from '../../auth-core/services/token.service';
```

```diff
     if (payload.aud !== 'customer') {
-      throw new UnauthorizedException('Wrong token audience');
+      throw new CodedUnauthorizedException(ErrorCode.AUTH_WRONG_TOKEN_AUDIENCE, 'Wrong token audience');
     }
```

```diff
     if (payload.tenantId !== this.cls.get<string>('tenantId')) {
-      throw new UnauthorizedException('Token tenant mismatch');
+      throw new CodedUnauthorizedException(ErrorCode.AUTH_TOKEN_TENANT_MISMATCH, 'Token tenant mismatch');
     }
```

- [ ] **Step 3: Verify existing suites still pass unchanged**

Run: `pnpm --filter @tiny-threads/api test -- customer-jwt.strategy customers-auth.controller`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/customers/customers-auth.controller.ts apps/api/src/customers/strategies/customer-jwt.strategy.ts
git commit -m "feat(api): retrofit customers controller/strategy throw sites with coded errors"
```

---

### Task 11: Retrofit `merchant-admins-auth.service.ts` throw sites

**Files:**
- Modify: `apps/api/src/merchant-admins/merchant-admins-auth.service.ts`

**Interfaces:**
- Consumes: `CodedConflictException`, `CodedForbiddenException`, `CodedNotFoundException`, `CodedUnauthorizedException` (Task 2); `ErrorCode` from `@tiny-threads/shared`.

- [ ] **Step 1: Swap the import block**

```diff
-import {
-  ConflictException,
-  ForbiddenException,
-  Inject,
-  Injectable,
-  NotFoundException,
-  UnauthorizedException,
-} from '@nestjs/common';
+import { Inject, Injectable } from '@nestjs/common';
 import { createHash, randomUUID } from 'node:crypto';
 import { ClsService } from 'nestjs-cls';
 import { IsNull } from 'typeorm';
 import type { EntityManager } from 'typeorm';
+import { ErrorCode } from '@tiny-threads/shared';
+import {
+  CodedConflictException,
+  CodedForbiddenException,
+  CodedNotFoundException,
+  CodedUnauthorizedException,
+} from '../common/errors/coded-exceptions';
 import {
   MerchantUser,
```

- [ ] **Step 2: Retrofit each throw site**

```diff
         if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
-          throw new NotFoundException('Invalid or expired invite token');
+          throw new CodedNotFoundException(
+            ErrorCode.MERCHANT_ADMIN_INVITE_TOKEN_INVALID,
+            'Invalid or expired invite token',
+          );
         }
```

```diff
         if (!claimResult.affected) {
-          throw new NotFoundException('Invalid or expired invite token');
+          throw new CodedNotFoundException(
+            ErrorCode.MERCHANT_ADMIN_INVITE_TOKEN_INVALID,
+            'Invalid or expired invite token',
+          );
         }
```

```diff
         if (existing) {
-          throw new ConflictException('Email already registered');
+          throw new CodedConflictException(
+            ErrorCode.MERCHANT_ADMIN_EMAIL_ALREADY_REGISTERED,
+            'Email already registered',
+          );
         }
```

```diff
     if (roleOutranks(params.role, params.invitedByRole)) {
-      throw new ForbiddenException(
-        `Cannot invite a member with a role higher than your own (${params.invitedByRole})`,
-      );
+      throw new CodedForbiddenException(
+        ErrorCode.MERCHANT_ADMIN_ROLE_TOO_HIGH,
+        `Cannot invite a member with a role higher than your own (${params.invitedByRole})`,
+        { invitedByRole: params.invitedByRole },
+      );
     }
```

```diff
       ) {
-        throw new NotFoundException('Invalid or expired verification token');
+        throw new CodedNotFoundException(
+          ErrorCode.MERCHANT_ADMIN_VERIFICATION_TOKEN_INVALID,
+          'Invalid or expired verification token',
+        );
       }
```

```diff
       ) {
-        throw new UnauthorizedException('Invalid email or password');
+        throw new CodedUnauthorizedException(
+          ErrorCode.AUTH_INVALID_CREDENTIALS,
+          'Invalid email or password',
+        );
       }
```

```diff
-      throw new NotFoundException(
+      throw new CodedNotFoundException(
+        ErrorCode.MERCHANT_ADMIN_NOT_FOUND,
         'No merchant admin account found for this email',
       );
```

```diff
       if (!existing) {
-        throw new UnauthorizedException('Invalid refresh token');
+        throw new CodedUnauthorizedException(
+          ErrorCode.AUTH_INVALID_REFRESH_TOKEN,
+          'Invalid refresh token',
+        );
       }
       if (existing.revokedAt) {
         // Reuse of a revoked token in this family is a theft signal: revoke
         // the whole family.
         await manager.update(
           MerchantUserRefreshToken,
           { familyId: existing.familyId },
           { revokedAt: new Date() },
         );
-        throw new UnauthorizedException('Refresh token reuse detected');
+        throw new CodedUnauthorizedException(
+          ErrorCode.AUTH_REFRESH_TOKEN_REUSE_DETECTED,
+          'Refresh token reuse detected',
+        );
       }
       if (existing.expiresAt < new Date()) {
-        throw new UnauthorizedException('Refresh token expired');
+        throw new CodedUnauthorizedException(
+          ErrorCode.AUTH_REFRESH_TOKEN_EXPIRED,
+          'Refresh token expired',
+        );
       }

       const merchantUser = await manager.findOne(MerchantUser, {
         where: { id: existing.merchantUserId },
       });
       if (!merchantUser) {
-        throw new UnauthorizedException('Merchant user no longer exists');
+        throw new CodedUnauthorizedException(
+          ErrorCode.MERCHANT_ADMIN_NO_LONGER_EXISTS,
+          'Merchant user no longer exists',
+        );
       }
```

```diff
       if (!revokeResult.affected) {
         await manager.update(
           MerchantUserRefreshToken,
           { familyId: existing.familyId },
           { revokedAt: new Date() },
         );
-        throw new UnauthorizedException('Refresh token reuse detected');
+        throw new CodedUnauthorizedException(
+          ErrorCode.AUTH_REFRESH_TOKEN_REUSE_DETECTED,
+          'Refresh token reuse detected',
+        );
       }
```

```diff
       ) {
-        throw new NotFoundException('Invalid or expired password reset token');
+        throw new CodedNotFoundException(
+          ErrorCode.MERCHANT_ADMIN_PASSWORD_RESET_TOKEN_INVALID,
+          'Invalid or expired password reset token',
+        );
       }
```

- [ ] **Step 3: Verify the existing suite still passes unchanged**

Run: `pnpm --filter @tiny-threads/api test -- merchant-admins-auth.service`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/merchant-admins/merchant-admins-auth.service.ts
git commit -m "feat(api): retrofit merchant-admins-auth.service throw sites with coded errors"
```

---

### Task 12: Retrofit `merchant-admins-auth.controller.ts`, `merchant-admin-jwt.strategy.ts`, `roles.guard.ts`

**Files:**
- Modify: `apps/api/src/merchant-admins/merchant-admins-auth.controller.ts`
- Modify: `apps/api/src/merchant-admins/strategies/merchant-admin-jwt.strategy.ts`
- Modify: `apps/api/src/merchant-admins/guards/roles.guard.ts`

**Interfaces:**
- Consumes: `CodedBadRequestException`, `CodedForbiddenException`, `CodedUnauthorizedException` (Task 2); `ErrorCode` from `@tiny-threads/shared`.

- [ ] **Step 1: Retrofit the controller**

```diff
-import {
-  BadRequestException,
-  Body,
-  Controller,
-  HttpCode,
-  Post,
-  Req,
-  Res,
-  UnauthorizedException,
-  UseGuards,
-} from '@nestjs/common';
+import { Body, Controller, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
 import { ConfigService } from '@nestjs/config';
 import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
 import { ClsService } from 'nestjs-cls';
 import type { Request, Response } from 'express';
+import { ErrorCode } from '@tiny-threads/shared';
+import {
+  CodedBadRequestException,
+  CodedUnauthorizedException,
+} from '../common/errors/coded-exceptions';
 import { OAuthStateService } from '../auth-core/services/oauth-state.service';
```

```diff
     if (!rawRefreshToken) {
-      throw new UnauthorizedException('Missing refresh token');
+      throw new CodedUnauthorizedException(
+        ErrorCode.AUTH_MISSING_REFRESH_TOKEN,
+        'Missing refresh token',
+      );
     }
```

```diff
     ) {
-      throw new BadRequestException('Invalid or expired code');
+      throw new CodedBadRequestException(
+        ErrorCode.OAUTH_INVALID_OR_EXPIRED_CODE,
+        'Invalid or expired code',
+      );
     }
```

- [ ] **Step 2: Retrofit the JWT strategy**

```diff
-import { Injectable, UnauthorizedException } from '@nestjs/common';
+import { Injectable } from '@nestjs/common';
 import { PassportStrategy } from '@nestjs/passport';
 import { ConfigService } from '@nestjs/config';
 import { ClsService } from 'nestjs-cls';
 import { ExtractJwt, Strategy } from 'passport-jwt';
+import { ErrorCode } from '@tiny-threads/shared';
+import { CodedUnauthorizedException } from '../../common/errors/coded-exceptions';
 import { AccessTokenPayload } from '../../auth-core/services/token.service';
```

```diff
     if (payload.aud !== 'merchant_admin') {
-      throw new UnauthorizedException('Wrong token audience');
+      throw new CodedUnauthorizedException(ErrorCode.AUTH_WRONG_TOKEN_AUDIENCE, 'Wrong token audience');
     }
```

```diff
     if (payload.tenantId !== this.cls.get<string>('tenantId')) {
-      throw new UnauthorizedException('Token tenant mismatch');
+      throw new CodedUnauthorizedException(ErrorCode.AUTH_TOKEN_TENANT_MISMATCH, 'Token tenant mismatch');
     }
```

- [ ] **Step 3: Retrofit `roles.guard.ts`**

```diff
-import {
-  CanActivate,
-  ExecutionContext,
-  ForbiddenException,
-  Injectable,
-} from '@nestjs/common';
+import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
 import { Reflector } from '@nestjs/core';
+import { ErrorCode } from '@tiny-threads/shared';
+import { CodedForbiddenException } from '../../common/errors/coded-exceptions';
 import { ROLES_KEY } from '../decorators/roles.decorator';
```

```diff
     if (!user?.role || !requiredRoles.includes(user.role)) {
-      throw new ForbiddenException('Insufficient role for this action');
+      throw new CodedForbiddenException(
+        ErrorCode.AUTH_INSUFFICIENT_ROLE,
+        'Insufficient role for this action',
+      );
     }
```

- [ ] **Step 4: Verify existing suites still pass unchanged**

Run: `pnpm --filter @tiny-threads/api test -- merchant-admin-jwt.strategy merchant-admins-auth.controller roles.guard`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/merchant-admins/merchant-admins-auth.controller.ts apps/api/src/merchant-admins/strategies/merchant-admin-jwt.strategy.ts apps/api/src/merchant-admins/guards/roles.guard.ts
git commit -m "feat(api): retrofit merchant-admins controller/strategy/roles-guard throw sites"
```

---

### Task 13: Retrofit `google-oauth.controller.ts` and `oauth-state.service.ts`

**Files:**
- Modify: `apps/api/src/oauth/google-oauth.controller.ts`
- Modify: `apps/api/src/auth-core/services/oauth-state.service.ts`

**Interfaces:**
- Consumes: `CodedBadRequestException` (Task 2); `ErrorCode` from `@tiny-threads/shared`.

- [ ] **Step 1: Retrofit the OAuth callback controller**

```diff
-import {
-  BadRequestException,
-  Controller,
-  Get,
-  Query,
-  Res,
-} from '@nestjs/common';
+import { Controller, Get, Query, Res } from '@nestjs/common';
 import { ConfigService } from '@nestjs/config';
 import { ApiOperation, ApiTags } from '@nestjs/swagger';
 import type { Response } from 'express';
 import { OAuth2Client } from 'google-auth-library';
 import { ClsService } from 'nestjs-cls';
+import { ErrorCode } from '@tiny-threads/shared';
+import { CodedBadRequestException } from '../common/errors/coded-exceptions';
 import { OAuthStateService } from '../auth-core/services/oauth-state.service';
```

```diff
     if (!tokens.id_token) {
-      throw new BadRequestException('Google did not return an id_token');
+      throw new CodedBadRequestException(
+        ErrorCode.OAUTH_MISSING_ID_TOKEN,
+        'Google did not return an id_token',
+      );
     }
     const ticket = await this.client.verifyIdToken({
       idToken: tokens.id_token,
     });
     const payload = ticket.getPayload();
     if (!payload?.sub || !payload.email) {
-      throw new BadRequestException('Invalid Google id_token payload');
+      throw new CodedBadRequestException(
+        ErrorCode.OAUTH_INVALID_ID_TOKEN_PAYLOAD,
+        'Invalid Google id_token payload',
+      );
     }
```

```diff
-    throw new BadRequestException('Unsupported OAuth population');
+    throw new CodedBadRequestException(
+      ErrorCode.OAUTH_UNSUPPORTED_POPULATION,
+      'Unsupported OAuth population',
+    );
```

- [ ] **Step 2: Retrofit `oauth-state.service.ts`**

```diff
-import { BadRequestException, Injectable } from '@nestjs/common';
+import { Injectable } from '@nestjs/common';
 import { ConfigService } from '@nestjs/config';
 import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
+import { ErrorCode } from '@tiny-threads/shared';
+import { CodedBadRequestException } from '../../common/errors/coded-exceptions';
 import { EnvironmentVariables } from '../../config/env.validation';
```

```diff
     if (!payload || !signature || !this.isValidSignature(payload, signature)) {
-      throw new BadRequestException('Invalid OAuth state');
+      throw new CodedBadRequestException(ErrorCode.OAUTH_INVALID_STATE, 'Invalid OAuth state');
     }
```

- [ ] **Step 3: Verify existing suites still pass unchanged**

Run: `pnpm --filter @tiny-threads/api test -- google-oauth.controller oauth-state.service`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/oauth/google-oauth.controller.ts apps/api/src/auth-core/services/oauth-state.service.ts
git commit -m "feat(api): retrofit oauth controller/state-service throw sites with coded errors"
```

---

### Task 14: Retrofit `tenant-resolution.middleware.ts` and `return-url.ts`

**Files:**
- Modify: `apps/api/src/common/middleware/tenant-resolution.middleware.ts`
- Modify: `apps/api/src/common/utils/return-url.ts`

**Interfaces:**
- Consumes: `CodedBadRequestException`, `CodedNotFoundException` (Task 2); `ErrorCode` from `@tiny-threads/shared`.

- [ ] **Step 1: Retrofit the middleware**

```diff
-import { Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
+import { Injectable, NestMiddleware } from '@nestjs/common';
 import { InjectDataSource } from '@nestjs/typeorm';
 import { NextFunction, Request, Response } from 'express';
 import { ClsService } from 'nestjs-cls';
 import { DataSource } from 'typeorm';
+import { ErrorCode } from '@tiny-threads/shared';
+import { CodedNotFoundException } from '../errors/coded-exceptions';
 import { Tenant } from '../../db/entities';
```

```diff
     if (!tenant) {
-      throw new NotFoundException('Unknown tenant');
+      throw new CodedNotFoundException(ErrorCode.TENANT_NOT_FOUND, 'Unknown tenant');
     }
```

- [ ] **Step 2: Retrofit `return-url.ts`**

```diff
-import { BadRequestException } from '@nestjs/common';
 import type { Request } from 'express';
+import { ErrorCode } from '@tiny-threads/shared';
+import { CodedBadRequestException } from '../errors/coded-exceptions';
```

```diff
   let parsed: URL;
   try {
     parsed = new URL(returnUrl);
   } catch {
-    throw new BadRequestException('returnUrl is not a valid absolute URL');
+    throw new CodedBadRequestException(
+      ErrorCode.INVALID_RETURN_URL,
+      'returnUrl is not a valid absolute URL',
+    );
   }
   if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
-    throw new BadRequestException('returnUrl must be an http(s) URL');
+    throw new CodedBadRequestException(
+      ErrorCode.INVALID_RETURN_URL,
+      'returnUrl must be an http(s) URL',
+    );
   }
```

```diff
   if (parsed.hostname !== req.hostname.toLowerCase()) {
-    throw new BadRequestException(
+    throw new CodedBadRequestException(
+      ErrorCode.INVALID_RETURN_URL,
       'returnUrl must point at the same host as this request',
     );
   }
```

- [ ] **Step 3: Verify existing suites still pass unchanged**

Run: `pnpm --filter @tiny-threads/api test -- tenant-resolution.middleware`
Expected: PASS

(`return-url.ts` has no dedicated spec file today — it's exercised indirectly through `customers-auth.controller.oauth-initiate.spec.ts` / `merchant-admins-auth.controller.oauth-initiate.spec.ts`, both of which assert `.toThrow(BadRequestException)`, still true for `CodedBadRequestException`.)

Run: `pnpm --filter @tiny-threads/api test -- oauth-initiate`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/common/middleware/tenant-resolution.middleware.ts apps/api/src/common/utils/return-url.ts
git commit -m "feat(api): retrofit tenant-resolution middleware and return-url guard with coded errors"
```

---

### Task 15: e2e test — customers auth error envelope

**Files:**
- Create: `apps/api/test/customers-auth-error-format.e2e-spec.ts`

**Interfaces:**
- Consumes: `configureApp` (Task 5), `AppModule`.

- [ ] **Step 1: Write the test**

```ts
// apps/api/test/customers-auth-error-format.e2e-spec.ts
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app/app.module';
import { Tenant } from '../src/db/entities';
import { configureApp } from '../src/bootstrap';

describe('Customers auth error envelope (e2e)', () => {
  let app: INestApplication;
  let tenantHost: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    const dataSource = app.get<DataSource>(getDataSourceToken());
    tenantHost = `error-format-customers-${randomUUID()}.localhost`;
    await dataSource.getRepository(Tenant).save(
      dataSource.getRepository(Tenant).create({
        name: 'Error Format Test Tenant',
        host: tenantHost,
      }),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns a VALIDATION_FAILED envelope with a decoded fields map for a short password', async () => {
    const response = await request(app.getHttpServer())
      .post('/customers/auth/register')
      .set('Host', tenantHost)
      .send({ email: 'jane@example.com', password: 'short', name: 'Jane' })
      .expect(400);

    expect(response.body).toMatchObject({
      error: {
        code: 'VALIDATION_FAILED',
        fields: {
          password: [
            expect.objectContaining({ code: 'MIN_LENGTH', params: { min: 12 } }),
          ],
        },
      },
    });
  });

  it('returns an AUTH_INVALID_CREDENTIALS envelope for a login with a wrong password', async () => {
    await request(app.getHttpServer())
      .post('/customers/auth/register')
      .set('Host', tenantHost)
      .send({
        email: 'wrong-password@example.com',
        password: 'correct horse battery staple',
        name: 'Wrong Password',
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/customers/auth/login')
      .set('Host', tenantHost)
      .send({ email: 'wrong-password@example.com', password: 'not the right password' })
      .expect(401);

    expect(response.body).toEqual({
      error: {
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Invalid email or password',
        params: {},
      },
    });
  });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm --filter @tiny-threads/api test:e2e -- customers-auth-error-format`
Expected: PASS (2 tests). If the validation case fails with a 500 instead of 400, check that `configureApp(app)` ran before `app.init()` (the global `ValidationPipe`/filter must be registered before the app starts handling requests).

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/customers-auth-error-format.e2e-spec.ts
git commit -m "test(api): add e2e coverage for the customers auth error envelope"
```

---

### Task 16: e2e test — merchant-admins auth error envelope

**Files:**
- Create: `apps/api/test/merchant-admins-auth-error-format.e2e-spec.ts`

**Interfaces:**
- Consumes: `configureApp` (Task 5), `AppModule`.

- [ ] **Step 1: Write the test**

```ts
// apps/api/test/merchant-admins-auth-error-format.e2e-spec.ts
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app/app.module';
import { Tenant } from '../src/db/entities';
import { configureApp } from '../src/bootstrap';

describe('Merchant admins auth error envelope (e2e)', () => {
  let app: INestApplication;
  let tenantHost: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    const dataSource = app.get<DataSource>(getDataSourceToken());
    tenantHost = `error-format-merchant-admins-${randomUUID()}.localhost`;
    await dataSource.getRepository(Tenant).save(
      dataSource.getRepository(Tenant).create({
        name: 'Error Format Test Tenant',
        host: tenantHost,
      }),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns a VALIDATION_FAILED envelope with a decoded fields map for a short password', async () => {
    const response = await request(app.getHttpServer())
      .post('/merchant-admins/auth/register')
      .set('Host', tenantHost)
      .send({ token: 'some-token', password: 'short' })
      .expect(400);

    expect(response.body).toMatchObject({
      error: {
        code: 'VALIDATION_FAILED',
        fields: {
          password: [
            expect.objectContaining({ code: 'MIN_LENGTH', params: { min: 12 } }),
          ],
        },
      },
    });
  });

  it('returns an AUTH_INVALID_CREDENTIALS envelope for a login with a wrong password', async () => {
    const response = await request(app.getHttpServer())
      .post('/merchant-admins/auth/login')
      .set('Host', tenantHost)
      .send({ email: 'no-such-admin@example.com', password: 'whatever password' })
      .expect(401);

    expect(response.body).toEqual({
      error: {
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Invalid email or password',
        params: {},
      },
    });
  });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm --filter @tiny-threads/api test:e2e -- merchant-admins-auth-error-format`
Expected: PASS (2 tests)

- [ ] **Step 3: Run the FULL test suite (unit + e2e) as final verification**

```bash
pnpm --filter @tiny-threads/api test
pnpm --filter @tiny-threads/api test:e2e
pnpm --filter @tiny-threads/api lint
pnpm build
```

Expected: everything green — this is the point-of-truth that the entire retrofit (16 tasks, ~38 throw sites, 15 DTOs, new shared package) holds together with no regressions.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/merchant-admins-auth-error-format.e2e-spec.ts
git commit -m "test(api): add e2e coverage for the merchant-admins auth error envelope"
```
