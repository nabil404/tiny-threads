# NestJS env var config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace scattered, inconsistent `process.env` reads across `apps/api` with a single validated `@nestjs/config` schema, so the app fails fast at boot with one clear error instead of five independent per-site guards each throwing on their own.

**Architecture:** One class-validator `EnvironmentVariables` schema (`apps/api/src/config/env.validation.ts`) plus a plain `validate()` function with no Nest dependencies. `ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate })` wires it into the running app; `data-source.ts` (the TypeORM CLI entry point, which runs outside Nest's DI) calls the same `validate()` function directly. Every existing `process.env` call site is migrated to inject `ConfigService<EnvironmentVariables, true>` instead.

**Tech Stack:** NestJS 11, `@nestjs/config`, `class-validator`, `class-transformer` (both already installed), Jest.

## Global Constraints

- Required env vars (validation fails at boot if any is missing/empty): `DATABASE_URL`, `DATABASE_URL_MIGRATIONS`, `JWT_SECRET`, `OAUTH_STATE_SECRET`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `PLATFORM_BASE_URL`.
- Optional env vars: `NODE_ENV` (enum `development`/`production`/`test`), `PORT` (numeric string).
- `ConfigModule.forRoot` uses `isGlobal: true` (matches the existing `@Global()` pattern on `DatabaseModule`) and `ignoreEnvFile: true` (because `main.ts` already runs `dotenv.config()` against the repo-root `.env` before `NestFactory.create(AppModule)` runs).
- `data-source.ts` must reuse the same `validate()` function from `env.validation.ts` — no duplicated validation rules.
- Every call site reads via `configService.get('KEY', { infer: true })` using `ConfigService<EnvironmentVariables, true>` — never a bare `.get('KEY')` without `{ infer: true }`, which would lose type inference.
- Unit tests live in `__tests__/` directories next to the code they cover, not colocated as `*.spec.ts` beside the source file (project convention).
- Prettier: single quotes, trailing commas everywhere.
- No behavior change for any migrated call site beyond centralizing the fail-fast check — same values, same runtime behavior.

---

### Task 1: Env validation schema

**Files:**
- Create: `apps/api/src/config/env.validation.ts`
- Test: `apps/api/src/config/__tests__/env.validation.spec.ts`

**Interfaces:**
- Produces: `export class EnvironmentVariables { NODE_ENV?: NodeEnv; PORT?: string; DATABASE_URL!: string; DATABASE_URL_MIGRATIONS!: string; JWT_SECRET!: string; OAUTH_STATE_SECRET!: string; GOOGLE_OAUTH_CLIENT_ID!: string; GOOGLE_OAUTH_CLIENT_SECRET!: string; PLATFORM_BASE_URL!: string; }` and `export function validate(config: Record<string, unknown>): EnvironmentVariables` (throws `Error` on validation failure). Every later task imports both from `../config/env.validation` (or the appropriate relative path).

- [ ] **Step 1: Add the `@nestjs/config` dependency**

Run: `pnpm --filter @tiny-threads/api add @nestjs/config`

- [ ] **Step 2: Write the failing test**

Create `apps/api/src/config/__tests__/env.validation.spec.ts`:

```ts
import { validate, EnvironmentVariables } from '../env.validation';

function validEnv(): Record<string, string> {
  return {
    DATABASE_URL: 'postgresql://app_runtime:pw@localhost:5432/tiny_threads',
    DATABASE_URL_MIGRATIONS:
      'postgresql://app_owner:pw@localhost:5432/tiny_threads',
    JWT_SECRET: 'jwt-secret',
    OAUTH_STATE_SECRET: 'oauth-state-secret',
    GOOGLE_OAUTH_CLIENT_ID: 'client-id',
    GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
    PLATFORM_BASE_URL: 'http://localhost:3000',
  };
}

describe('validate', () => {
  it('returns an EnvironmentVariables instance given a complete valid env', () => {
    const result = validate(validEnv());

    expect(result).toBeInstanceOf(EnvironmentVariables);
    expect(result.DATABASE_URL).toBe(validEnv().DATABASE_URL);
  });

  it('passes when optional NODE_ENV and PORT are omitted', () => {
    expect(() => validate(validEnv())).not.toThrow();
  });

  it('accepts a valid NODE_ENV value', () => {
    expect(() =>
      validate({ ...validEnv(), NODE_ENV: 'production' }),
    ).not.toThrow();
  });

  it('throws when NODE_ENV is set to an invalid value', () => {
    expect(() => validate({ ...validEnv(), NODE_ENV: 'staging' })).toThrow();
  });

  it('accepts a valid numeric PORT', () => {
    expect(() => validate({ ...validEnv(), PORT: '4000' })).not.toThrow();
  });

  it('throws when PORT is set to a non-numeric value', () => {
    expect(() => validate({ ...validEnv(), PORT: 'abc' })).toThrow();
  });

  it.each([
    'DATABASE_URL',
    'DATABASE_URL_MIGRATIONS',
    'JWT_SECRET',
    'OAUTH_STATE_SECRET',
    'GOOGLE_OAUTH_CLIENT_ID',
    'GOOGLE_OAUTH_CLIENT_SECRET',
    'PLATFORM_BASE_URL',
  ])('throws when %s is missing', (key) => {
    const env = validEnv() as Record<string, string | undefined>;
    delete env[key];

    expect(() => validate(env)).toThrow();
  });

  it.each([
    'DATABASE_URL',
    'DATABASE_URL_MIGRATIONS',
    'JWT_SECRET',
    'OAUTH_STATE_SECRET',
    'GOOGLE_OAUTH_CLIENT_ID',
    'GOOGLE_OAUTH_CLIENT_SECRET',
    'PLATFORM_BASE_URL',
  ])('throws when %s is an empty string', (key) => {
    const env = { ...validEnv(), [key]: '' };

    expect(() => validate(env)).toThrow();
  });
});
```

- [ ] **Step 2b: Run the test to verify it fails**

Run: `pnpm --filter @tiny-threads/api test -- env.validation`
Expected: FAIL with "Cannot find module '../env.validation'" (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/config/env.validation.ts`:

```ts
import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  validateSync,
} from 'class-validator';

enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvironmentVariables {
  @IsOptional()
  @IsEnum(NodeEnv)
  NODE_ENV?: NodeEnv;

  @IsOptional()
  @IsNumberString()
  PORT?: string;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL_MIGRATIONS!: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  OAUTH_STATE_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  GOOGLE_OAUTH_CLIENT_ID!: string;

  @IsString()
  @IsNotEmpty()
  GOOGLE_OAUTH_CLIENT_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  PLATFORM_BASE_URL!: string;
}

export function validate(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validated;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @tiny-threads/api test -- env.validation`
Expected: PASS, all cases green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml apps/api/src/config
git commit -m "feat(config): add validated env var schema"
```

---

### Task 2: Wire ConfigModule into AppModule

**Files:**
- Modify: `apps/api/src/app/app.module.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `validate` from `../config/env.validation` (Task 1).
- Produces: `ConfigService<EnvironmentVariables, true>` becomes injectable application-wide (no later module needs to import `ConfigModule` itself).

- [ ] **Step 1: Wire `ConfigModule.forRoot` into `AppModule`**

Edit `apps/api/src/app/app.module.ts` — add the import and include it first in `imports`:

```ts
import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from '../db/database.module';
import { TenantResolutionMiddleware } from '../tenancy/tenant-resolution.middleware';
import { CustomersAuthModule } from '../customers/customers-auth.module';
import { OAuthModule } from '../oauth/oauth.module';
import { MerchantAdminsAuthModule } from '../merchant-admins/merchant-admins-auth.module';
import { validate } from '../config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true, // main.ts already loads the repo-root .env via dotenv before Nest boots
      validate,
    }),
    DatabaseModule,
    CustomersAuthModule,
    OAuthModule,
    MerchantAdminsAuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantResolutionMiddleware)
      .exclude(
        { path: 'auth/google/callback', method: RequestMethod.GET },
        { path: '/', method: RequestMethod.GET },
      )
      .forRoutes('*');
  }
}
```

(Only the `imports` array and its new `ConfigModule` entry change — the `configure` method and its comments are unchanged from the current file.)

- [ ] **Step 2: Note the validation behavior in `.env.example`**

Edit `.env.example` — add this line at the very top of the file, above the existing `POSTGRES_USER=postgres` line:

```
# All variables below are validated at boot by apps/api/src/config/env.validation.ts —
# a missing or empty required value fails the app immediately with a clear error
# listing everything wrong, rather than failing later at first use.

```

- [ ] **Step 3: Verify the app still boots against a real `.env`**

Run: `pnpm --filter @tiny-threads/api build`
Expected: builds with no TypeScript errors (this task doesn't yet touch any call site, so no runtime behavior has changed — this just confirms the new import compiles cleanly).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/app/app.module.ts .env.example
git commit -m "feat(config): wire ConfigModule into AppModule"
```

---

### Task 3: Migrate data-source.ts (TypeORM CLI)

**Files:**
- Modify: `apps/api/src/db/data-source.ts`

**Interfaces:**
- Consumes: `validate` from `../config/env.validation` (Task 1).

- [ ] **Step 1: Replace the manual env check with `validate()`**

Edit `apps/api/src/db/data-source.ts` to:

```ts
import { config } from 'dotenv';
import { resolve } from 'path';
import * as entities from './entities';
import { validate } from '../config/env.validation';

config({ path: resolve(__dirname, '../../../../.env') });

import { DataSource, DataSourceOptions } from 'typeorm';

const env = validate(process.env);

// CLI-only DataSource: connects as app_owner (table owner, runs DDL). Never
// imported by the running app — DatabaseModule builds its own DataSource via
// TypeOrmModule.forRootAsync, connected as app_runtime.
export const typeOrmConfig: DataSourceOptions = {
  type: 'postgres',
  url: env.DATABASE_URL_MIGRATIONS,
  entities: Object.values(entities),
  migrations: [process.cwd() + '/src/db/migrations/*.ts'],
  migrationsTableName: 'migrations',
  synchronize: false,
  migrationsRun: false,
  ssl: env.NODE_ENV === 'production',
  logging: env.NODE_ENV === 'development',
};

export default new DataSource({
  ...typeOrmConfig,
  entities: [process.cwd() + '/src/db/entities/*.entity.ts'],
});
```

- [ ] **Step 2: Verify against the real local `.env`**

Run: `pnpm --filter @tiny-threads/api db:verify-rls`
Expected: connects successfully and reports RLS status (this exercises `data-source.ts`'s config end to end against your local `.env`; it should behave identically to before this change). If your local Postgres isn't running, run `docker compose up -d` first (per the repo root `docker-compose.yml`).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/db/data-source.ts
git commit -m "refactor(config): migrate data-source.ts to validated env schema"
```

---

### Task 4: Migrate database.module.ts and main.ts

**Files:**
- Modify: `apps/api/src/db/database.module.ts`
- Modify: `apps/api/src/main.ts`

**Interfaces:**
- Consumes: `ConfigService<EnvironmentVariables, true>` (global, from Task 2); `EnvironmentVariables` from `../config/env.validation` (Task 1).

- [ ] **Step 1: Migrate `database.module.ts`**

Edit `apps/api/src/db/database.module.ts` to:

```ts
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClsModule } from 'nestjs-cls';
import { TenantDbService } from './tenant-db.service';
import * as entities from './entities';
import { EnvironmentVariables } from '../config/env.validation';

// The app connects as app_runtime ONLY — a non-owner role subject to RLS.
// Migrations (as app_owner) run separately via the TypeORM CLI against
// data-source.ts, never through this connection.
@Global()
@Module({
  imports: [
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (
        configService: ConfigService<EnvironmentVariables, true>,
      ) => ({
        type: 'postgres' as const,
        url: configService.get('DATABASE_URL', { infer: true }),
        entities: Object.values(entities),
        synchronize: false, // never — synchronize can't express RLS and would fight migrations
        migrationsRun: false, // migrations run as app_owner via CLI, never at app boot as app_runtime
      }),
    }),
  ],
  providers: [TenantDbService],
  exports: [TypeOrmModule, TenantDbService],
})
export class DatabaseModule {}
```

- [ ] **Step 2: Migrate `main.ts`**

Edit `apps/api/src/main.ts` to:

```ts
import { config } from 'dotenv';
import { resolve } from 'path';

// Repo root is three levels up from this file's directory, both from src/
// (apps/api/src) when run via ts-node and from dist/ (apps/api/dist) after a
// build. data-source.ts needs four because it sits one level deeper (src/db).
config({ path: resolve(__dirname, '../../../.env') });

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app/app.module';
import { EnvironmentVariables } from './config/env.validation';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const configService = app.get<ConfigService<EnvironmentVariables, true>>(
    ConfigService,
  );
  await app.listen(configService.get('PORT', { infer: true }) ?? 3000);
}
void bootstrap();
```

- [ ] **Step 3: Verify the app boots against the real local `.env`**

Run: `pnpm --filter @tiny-threads/api start:dev` (requires local Postgres running via `docker compose up -d`, and a filled-in `.env` per `.env.example`)
Expected: app starts and logs it's listening, with no unhandled startup errors. Stop it with Ctrl-C once confirmed.

- [ ] **Step 4: Run the full unit test suite**

Run: `pnpm --filter @tiny-threads/api test`
Expected: PASS (no test file exists yet for either of these two files, so nothing should regress).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/database.module.ts apps/api/src/main.ts
git commit -m "refactor(config): migrate database.module.ts and main.ts to ConfigService"
```

---

### Task 5: Migrate OAuthStateService

**Files:**
- Modify: `apps/api/src/auth-core/oauth-state.service.ts`
- Modify (test): `apps/api/src/auth-core/__tests__/oauth-state.service.spec.ts`

**Interfaces:**
- Consumes: `ConfigService<EnvironmentVariables, true>` (global, Task 2); `EnvironmentVariables` from `../config/env.validation` (Task 1).
- Produces: `OAuthStateService`'s constructor signature changes from `constructor()` to `constructor(configService: ConfigService<EnvironmentVariables, true>)` — Task 6 (`AuthCoreModule`) and any test constructing `OAuthStateService` directly must pass this new argument.

- [ ] **Step 1: Update the failing test first**

Edit `apps/api/src/auth-core/__tests__/oauth-state.service.spec.ts` to:

```ts
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuthStateService } from '../oauth-state.service';
import type { EnvironmentVariables } from '../../config/env.validation';

function buildService(secret = 'test-oauth-state-secret') {
  const configService = {
    get: jest.fn().mockReturnValue(secret),
  } as unknown as ConfigService<EnvironmentVariables, true>;
  return new OAuthStateService(configService);
}

describe('OAuthStateService', () => {
  it('round-trips a state payload', () => {
    const service = buildService();
    const token = service.encode({
      population: 'customer',
      tenantId: 'tenant-1',
      returnUrl: 'https://shop.platform.com/account',
      intent: 'login',
    });
    const decoded = service.decode(token);
    expect(decoded).toMatchObject({
      population: 'customer',
      tenantId: 'tenant-1',
      returnUrl: 'https://shop.platform.com/account',
      intent: 'login',
    });
    expect(typeof decoded.nonce).toBe('string');
  });

  it('rejects a tampered state token', () => {
    const service = buildService();
    const token = service.encode({
      population: 'merchant_admin',
      tenantId: 'tenant-1',
      returnUrl: 'https://shop.platform.com/admin',
      intent: 'login',
    });
    const [payload] = token.split('.');
    const tampered = `${payload}.deadbeef`;
    expect(() => service.decode(tampered)).toThrow(BadRequestException);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @tiny-threads/api test -- oauth-state.service`
Expected: FAIL — `OAuthStateService` constructor doesn't yet accept a `ConfigService` argument (TypeScript error or, if it compiles loosely, a runtime `OAUTH_STATE_SECRET is not set` error since `process.env.OAUTH_STATE_SECRET` is no longer set by this test).

- [ ] **Step 3: Migrate the implementation**

Edit `apps/api/src/auth-core/oauth-state.service.ts` to:

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { EnvironmentVariables } from '../config/env.validation';

export interface OAuthState {
  population: 'customer' | 'merchant_admin';
  tenantId: string;
  returnUrl: string;
  intent: 'login' | 'link';
  linkCustomerId?: string;
  nonce: string;
}

@Injectable()
export class OAuthStateService {
  private readonly secret: string;

  constructor(configService: ConfigService<EnvironmentVariables, true>) {
    this.secret = configService.get('OAUTH_STATE_SECRET', { infer: true });
  }

  encode(state: Omit<OAuthState, 'nonce'>): string {
    const full: OAuthState = { ...state, nonce: randomUUID() };
    const payload = Buffer.from(JSON.stringify(full)).toString('base64url');
    return `${payload}.${this.sign(payload)}`;
  }

  decode(token: string): OAuthState {
    const [payload, signature] = token.split('.');
    if (!payload || !signature || !this.isValidSignature(payload, signature)) {
      throw new BadRequestException('Invalid OAuth state');
    }
    return JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as OAuthState;
  }

  private isValidSignature(payload: string, signature: string): boolean {
    const expected = Buffer.from(this.sign(payload));
    const actual = Buffer.from(signature);
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret)
      .update(payload)
      .digest('base64url');
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @tiny-threads/api test -- oauth-state.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth-core/oauth-state.service.ts apps/api/src/auth-core/__tests__/oauth-state.service.spec.ts
git commit -m "refactor(config): migrate OAuthStateService to ConfigService"
```

---

### Task 6: Migrate AuthCoreModule (JwtModule.registerAsync)

**Files:**
- Modify: `apps/api/src/auth-core/auth-core.module.ts`
- Modify (test): `apps/api/src/auth-core/__tests__/auth-core.module.spec.ts`

**Interfaces:**
- Consumes: `ConfigService<EnvironmentVariables, true>` (global, Task 2); `OAuthStateService` with its new constructor from Task 5.

- [ ] **Step 1: Update the failing test first**

Edit `apps/api/src/auth-core/__tests__/auth-core.module.spec.ts` to:

```ts
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { HashingService } from '../hashing.service';
import { TokenService } from '../token.service';
import { OAuthStateService } from '../oauth-state.service';
import { NOTIFICATIONS_PORT } from '../notifications/notifications-port';
import { AuthCoreModule } from '../auth-core.module';

describe('AuthCoreModule', () => {
  const originalEnv = { ...process.env };

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.OAUTH_STATE_SECRET = 'test-oauth-state-secret';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('provides HashingService, TokenService, OAuthStateService, and NOTIFICATIONS_PORT', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        AuthCoreModule,
      ],
    }).compile();

    expect(moduleRef.get(HashingService)).toBeInstanceOf(HashingService);
    expect(moduleRef.get(TokenService)).toBeInstanceOf(TokenService);
    expect(moduleRef.get(OAuthStateService)).toBeInstanceOf(OAuthStateService);
    expect(moduleRef.get(NOTIFICATIONS_PORT)).toBeDefined();
  });
});
```

(This uses a bare `ConfigModule.forRoot` with no `validate` option, since this test only needs `JWT_SECRET`/`OAUTH_STATE_SECRET` from `process.env`, not the full required-vars set — `env.validation.ts` is already covered directly by Task 1's tests.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @tiny-threads/api test -- auth-core.module`
Expected: FAIL — `AuthCoreModule`'s `JwtModule.registerAsync` still reads `process.env.JWT_SECRET` directly today, so this specific test still technically passes; instead this step confirms today's baseline passes, then Step 3 changes the implementation without breaking it. (If today's baseline already fails for an unrelated reason, stop and investigate before continuing — this task must not paper over a pre-existing failure.)

- [ ] **Step 3: Migrate the implementation**

Edit `apps/api/src/auth-core/auth-core.module.ts` to:

```ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { HashingService } from './hashing.service';
import { TokenService } from './token.service';
import { OAuthStateService } from './oauth-state.service';
import { NOTIFICATIONS_PORT } from './notifications/notifications-port';
import { LogNotificationsAdapter } from './notifications/log-notifications.adapter';
import { EnvironmentVariables } from '../config/env.validation';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (
        configService: ConfigService<EnvironmentVariables, true>,
      ) => ({
        secret: configService.get('JWT_SECRET', { infer: true }),
      }),
    }),
  ],
  providers: [
    HashingService,
    TokenService,
    OAuthStateService,
    { provide: NOTIFICATIONS_PORT, useClass: LogNotificationsAdapter },
  ],
  exports: [
    JwtModule,
    HashingService,
    TokenService,
    OAuthStateService,
    NOTIFICATIONS_PORT,
  ],
})
export class AuthCoreModule {}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @tiny-threads/api test -- auth-core.module`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth-core/auth-core.module.ts apps/api/src/auth-core/__tests__/auth-core.module.spec.ts
git commit -m "refactor(config): migrate AuthCoreModule's JwtModule to ConfigService"
```

---

### Task 7: Migrate CustomerJwtStrategy and MerchantAdminJwtStrategy

**Files:**
- Modify: `apps/api/src/customers/customer-jwt.strategy.ts`
- Modify (test): `apps/api/src/customers/__tests__/customer-jwt.strategy.spec.ts`
- Modify: `apps/api/src/merchant-admins/merchant-admin-jwt.strategy.ts`
- Modify (test): `apps/api/src/merchant-admins/__tests__/merchant-admin-jwt.strategy.spec.ts`

**Interfaces:**
- Consumes: `ConfigService<EnvironmentVariables, true>` (global, Task 2).
- Produces: both strategies' constructors change from `constructor(cls: ClsService)` to `constructor(cls: ClsService, configService: ConfigService<EnvironmentVariables, true>)`.

- [ ] **Step 1: Update the failing tests first**

Edit `apps/api/src/customers/__tests__/customer-jwt.strategy.spec.ts` — replace the top of the file (everything through `beforeAll`) with:

```ts
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { CustomerJwtStrategy } from '../customer-jwt.strategy';
import type { AccessTokenPayload } from '../../auth-core/token.service';
import type { EnvironmentVariables } from '../../config/env.validation';

// The two most load-bearing security properties of the access token are
// audience separation (a customer token must not authenticate a merchant admin
// route) and tenant binding (a token minted for tenant A must not authenticate
// a request arriving on tenant B's subdomain). Both are enforced only here, so
// they get direct coverage rather than being implied by higher-level tests.
function buildStrategy(clsTenantId: string | undefined) {
  const cls = {
    get: jest.fn().mockReturnValue(clsTenantId),
  } as unknown as ClsService;
  const configService = {
    get: jest.fn().mockReturnValue('test-jwt-secret'),
  } as unknown as ConfigService<EnvironmentVariables, true>;
  return { strategy: new CustomerJwtStrategy(cls, configService), cls };
}
```

(Remove the `beforeAll(() => { process.env.JWT_SECRET = ... })` block entirely — the rest of the file, all `describe`/`it` blocks, stays unchanged.)

Apply the mirrored change to `apps/api/src/merchant-admins/__tests__/merchant-admin-jwt.strategy.spec.ts`:

```ts
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { MerchantAdminJwtStrategy } from '../merchant-admin-jwt.strategy';
import type { AccessTokenPayload } from '../../auth-core/token.service';
import type { EnvironmentVariables } from '../../config/env.validation';

// Mirrors customer-jwt.strategy.spec.ts — direct coverage for the audience
// separation and tenant binding enforced by this strategy (see there for the
// rationale on why these two properties get dedicated tests).
function buildStrategy(clsTenantId: string | undefined) {
  const cls = {
    get: jest.fn().mockReturnValue(clsTenantId),
  } as unknown as ClsService;
  const configService = {
    get: jest.fn().mockReturnValue('test-jwt-secret'),
  } as unknown as ConfigService<EnvironmentVariables, true>;
  return {
    strategy: new MerchantAdminJwtStrategy(cls, configService),
    cls,
  };
}
```

(Remove its `beforeAll` block too; the rest of the file is unchanged.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @tiny-threads/api test -- jwt.strategy`
Expected: FAIL — both strategies' constructors don't yet accept a second argument.

- [ ] **Step 3: Migrate the implementations**

Edit `apps/api/src/customers/customer-jwt.strategy.ts` to:

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AccessTokenPayload } from '../auth-core/token.service';
import { EnvironmentVariables } from '../config/env.validation';

@Injectable()
export class CustomerJwtStrategy extends PassportStrategy(
  Strategy,
  'customer-jwt',
) {
  constructor(
    private readonly cls: ClsService,
    configService: ConfigService<EnvironmentVariables, true>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get('JWT_SECRET', { infer: true }),
    });
  }

  validate(payload: AccessTokenPayload): AccessTokenPayload {
    if (payload.aud !== 'customer') {
      throw new UnauthorizedException('Wrong token audience');
    }
    // Every tenant shares one JWT signing secret, so a signature alone does
    // not say WHICH tenant a token belongs to. Without this check a token
    // minted on tenant A's subdomain is accepted verbatim when replayed
    // against tenant B's subdomain, and the request only fails later — as an
    // unhandled 500 from an RLS WITH CHECK violation — instead of a clean 401.
    // The CLS tenant is the one TenantResolutionMiddleware resolved from this
    // request's own host, so it is the authority here.
    if (payload.tenantId !== this.cls.get<string>('tenantId')) {
      throw new UnauthorizedException('Token tenant mismatch');
    }
    return payload;
  }
}
```

Edit `apps/api/src/merchant-admins/merchant-admin-jwt.strategy.ts` to:

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AccessTokenPayload } from '../auth-core/token.service';
import { EnvironmentVariables } from '../config/env.validation';

@Injectable()
export class MerchantAdminJwtStrategy extends PassportStrategy(
  Strategy,
  'merchant-admin-jwt',
) {
  constructor(
    private readonly cls: ClsService,
    configService: ConfigService<EnvironmentVariables, true>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get('JWT_SECRET', { infer: true }),
    });
  }

  validate(payload: AccessTokenPayload): AccessTokenPayload {
    if (payload.aud !== 'merchant_admin') {
      throw new UnauthorizedException('Wrong token audience');
    }
    // Every tenant shares one JWT signing secret, so a signature alone does
    // not say WHICH tenant a token belongs to. Without this check a token
    // minted on tenant A's subdomain is accepted verbatim when replayed
    // against tenant B's subdomain, and the request only fails later — as an
    // unhandled 500 from an RLS WITH CHECK violation — instead of a clean 401.
    // The CLS tenant is the one TenantResolutionMiddleware resolved from this
    // request's own host, so it is the authority here.
    if (payload.tenantId !== this.cls.get<string>('tenantId')) {
      throw new UnauthorizedException('Token tenant mismatch');
    }
    return payload;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @tiny-threads/api test -- jwt.strategy`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/customers/customer-jwt.strategy.ts apps/api/src/customers/__tests__/customer-jwt.strategy.spec.ts apps/api/src/merchant-admins/merchant-admin-jwt.strategy.ts apps/api/src/merchant-admins/__tests__/merchant-admin-jwt.strategy.spec.ts
git commit -m "refactor(config): migrate JWT strategies to ConfigService"
```

---

### Task 8: Migrate GoogleOAuthController

**Files:**
- Modify: `apps/api/src/oauth/google-oauth.controller.ts`
- Modify (test): `apps/api/src/oauth/__tests__/google-oauth.controller.spec.ts`

**Interfaces:**
- Consumes: `ConfigService<EnvironmentVariables, true>` (global, Task 2).
- Produces: `GoogleOAuthController`'s constructor gains a final `configService: ConfigService<EnvironmentVariables, true>` parameter.

- [ ] **Step 1: Update the failing test first**

Edit `apps/api/src/oauth/__tests__/google-oauth.controller.spec.ts`:
- Remove the three top-level `process.env.GOOGLE_OAUTH_CLIENT_ID ??= ...` / `process.env.GOOGLE_OAUTH_CLIENT_SECRET ??= ...` / `process.env.PLATFORM_BASE_URL ??= ...` lines (and their comment) near the top of the file.
- Add a `ConfigService` import and build a mock inside `buildController()`, passed as the controller's final constructor argument:

```ts
import { GoogleOAuthController } from '../google-oauth.controller';
import type { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../../config/env.validation';

function buildController(
  stateOverrides: Partial<{
    population: 'customer' | 'merchant_admin';
    tenantId: string;
    returnUrl: string;
    intent: 'login' | 'link';
    linkCustomerId?: string;
  }> = {},
) {
  const state = {
    population: 'customer' as const,
    tenantId: 'tenant-1',
    returnUrl: 'https://shop.example.com/account',
    intent: 'login' as const,
    nonce: 'nonce-1',
    ...stateOverrides,
  };

  const callOrder: string[] = [];

  const oauthState = { decode: jest.fn().mockReturnValue(state) } as any;
  const customersAuthService = {
    findOrCreateFromGoogle: jest.fn().mockImplementation(() => {
      callOrder.push('findOrCreateFromGoogle');
      return Promise.resolve({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
    }),
    linkGoogleIdentity: jest.fn().mockImplementation(() => {
      callOrder.push('linkGoogleIdentity');
      return Promise.resolve(undefined);
    }),
  } as any;
  const merchantAdminsAuthService = {
    findOrCreateFromGoogle: jest.fn().mockImplementation(() => {
      callOrder.push('merchantAdminsFindOrCreateFromGoogle');
      return Promise.resolve({
        accessToken: 'merchant-access-token',
        refreshToken: 'merchant-refresh-token',
      });
    }),
  } as any;
  const oneTimeCodeService = {
    issue: jest.fn().mockReturnValue('one-time-code-123'),
  } as any;
  const cls = {
    set: jest.fn().mockImplementation((key: string) => {
      callOrder.push(`cls.set:${key}`);
    }),
  } as any;
  const configService = {
    get: jest.fn(
      (key: string) =>
        ({
          GOOGLE_OAUTH_CLIENT_ID: 'test-client-id',
          GOOGLE_OAUTH_CLIENT_SECRET: 'test-client-secret',
          PLATFORM_BASE_URL: 'https://platform.example.com',
        })[key],
    ),
  } as unknown as ConfigService<EnvironmentVariables, true>;

  const controller = new GoogleOAuthController(
    oauthState,
    customersAuthService,
    merchantAdminsAuthService,
    oneTimeCodeService,
    cls,
    configService,
  );
  // The Google API client is a real OAuth2Client instance created in a class
  // field — swap it for a stub so tests never make a real network call.
  (controller as any).client = {
    getToken: jest.fn().mockImplementation(() => {
      callOrder.push('client.getToken');
      return Promise.resolve({ tokens: { id_token: 'id-token-abc' } });
    }),
    verifyIdToken: jest.fn().mockResolvedValue({
      getPayload: () => ({
        sub: 'google-sub-1',
        email: 'jane@example.com',
        email_verified: true,
      }),
    }),
  };

  return {
    controller,
    oauthState,
    customersAuthService,
    merchantAdminsAuthService,
    oneTimeCodeService,
    cls,
    callOrder,
    state,
  };
}
```

(The rest of the file — all `describe`/`it` blocks below `buildController` — stays unchanged.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @tiny-threads/api test -- google-oauth.controller`
Expected: FAIL — `GoogleOAuthController`'s constructor doesn't yet accept a sixth argument.

- [ ] **Step 3: Migrate the implementation**

Edit `apps/api/src/oauth/google-oauth.controller.ts` — replace the imports and constructor:

```ts
import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { ClsService } from 'nestjs-cls';
import { OAuthStateService } from '../auth-core/oauth-state.service';
import { CustomersAuthService } from '../customers/customers-auth.service';
import { MerchantAdminsAuthService } from '../merchant-admins/merchant-admins-auth.service';
import { OneTimeCodeService } from './one-time-code.service';
import { EnvironmentVariables } from '../config/env.validation';

// Single centralized callback registered once in Google Cloud Console —
// tenant subdomains/custom domains can't be registered individually with
// Google, so every population's OAuth flow routes through here and is then
// redirected back to the originating tenant domain.
@Controller('auth/google')
export class GoogleOAuthController {
  private readonly client: OAuth2Client;

  constructor(
    private readonly oauthState: OAuthStateService,
    private readonly customersAuthService: CustomersAuthService,
    private readonly merchantAdminsAuthService: MerchantAdminsAuthService,
    private readonly oneTimeCodeService: OneTimeCodeService,
    private readonly cls: ClsService,
    configService: ConfigService<EnvironmentVariables, true>,
  ) {
    // ConfigModule validates PLATFORM_BASE_URL (and the Google client
    // id/secret) at boot — see src/config/env.validation.ts — so by the time
    // this constructor runs they are guaranteed to be set. Unset, this would
    // otherwise silently become the string "undefined/auth/google/callback" —
    // a redirect_uri that no longer matches what's registered in Google Cloud
    // Console, so every OAuth login breaks with an opaque Google-side error.
    this.client = new OAuth2Client(
      configService.get('GOOGLE_OAUTH_CLIENT_ID', { infer: true }),
      configService.get('GOOGLE_OAUTH_CLIENT_SECRET', { infer: true }),
      `${configService.get('PLATFORM_BASE_URL', { infer: true })}/auth/google/callback`,
    );
  }

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') stateToken: string,
    @Res() res: Response,
  ) {
    const state = this.oauthState.decode(stateToken);
    // This route is deliberately excluded from TenantResolutionMiddleware
    // (it's a platform-domain route, not a per-tenant subdomain — Google
    // can't be registered with one callback per tenant), so nothing else
    // populates CLS here. TenantDbService.run()/withTenant() read the
    // tenant EXCLUSIVELY from CLS and throw if it's unset, so this must be
    // set from the verified state before any call that touches the
    // database (findOrCreateFromGoogle/linkGoogleIdentity below).
    this.cls.set('tenantId', state.tenantId);
    const { tokens } = await this.client.getToken(code);
    if (!tokens.id_token) {
      throw new BadRequestException('Google did not return an id_token');
    }
    const ticket = await this.client.verifyIdToken({
      idToken: tokens.id_token,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) {
      throw new BadRequestException('Invalid Google id_token payload');
    }

    if (state.population === 'customer') {
      if (state.intent === 'link' && state.linkCustomerId) {
        await this.customersAuthService.linkGoogleIdentity({
          tenantId: state.tenantId,
          customerId: state.linkCustomerId,
          googleSub: payload.sub,
          email: payload.email,
        });
        // No tokens are minted by linking, so there's nothing sensitive to
        // hand off here — a plain redirect is fine.
        return res.redirect(`${state.returnUrl}?linked=true`);
      }

      const result = await this.customersAuthService.findOrCreateFromGoogle({
        tenantId: state.tenantId,
        googleSub: payload.sub,
        email: payload.email,
        emailVerified: Boolean(payload.email_verified),
      });
      if ('linkRequired' in result) {
        return res.redirect(`${state.returnUrl}?linkRequired=true`);
      }

      // Hand off via a short-lived, single-use one-time code rather than
      // putting the token pair in the URL — the tenant domain exchanges it
      // server-side for the real tokens (see
      // CustomersAuthController#exchangeGoogleCode).
      const oneTimeCode = this.oneTimeCodeService.issue({
        population: 'customer',
        tenantId: state.tenantId,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
      return res.redirect(
        `${state.returnUrl}?code=${encodeURIComponent(oneTimeCode)}`,
      );
    }

    if (state.population === 'merchant_admin') {
      const result =
        await this.merchantAdminsAuthService.findOrCreateFromGoogle({
          tenantId: state.tenantId,
          googleSub: payload.sub,
          email: payload.email,
          emailVerified: Boolean(payload.email_verified),
        });
      if ('linkRequired' in result) {
        return res.redirect(`${state.returnUrl}?linkRequired=true`);
      }

      // Same opaque, single-use, tenant-bound hand-off as the customer
      // branch above — see CustomersAuthController#exchangeGoogleCode /
      // MerchantAdminsAuthController#exchangeGoogleCode.
      const oneTimeCode = this.oneTimeCodeService.issue({
        population: 'merchant_admin',
        tenantId: state.tenantId,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
      return res.redirect(
        `${state.returnUrl}?code=${encodeURIComponent(oneTimeCode)}`,
      );
    }

    throw new BadRequestException('Unsupported OAuth population');
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @tiny-threads/api test -- google-oauth.controller`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/oauth/google-oauth.controller.ts apps/api/src/oauth/__tests__/google-oauth.controller.spec.ts
git commit -m "refactor(config): migrate GoogleOAuthController to ConfigService"
```

---

### Task 9: Migrate CustomersAuthController and MerchantAdminsAuthController

**Files:**
- Modify: `apps/api/src/customers/customers-auth.controller.ts`
- Modify (test): `apps/api/src/customers/__tests__/customers-auth.controller.oauth-initiate.spec.ts`
- Modify (test): `apps/api/src/customers/__tests__/customers-auth.controller.oauth-exchange.spec.ts`
- Modify: `apps/api/src/merchant-admins/merchant-admins-auth.controller.ts`
- Modify (test): `apps/api/src/merchant-admins/__tests__/merchant-admins-auth.controller.oauth-initiate.spec.ts`
- Modify (test): `apps/api/src/merchant-admins/__tests__/merchant-admins-auth.controller.oauth-exchange.spec.ts`

Both controllers are also constructed directly (with the current 4-argument constructor) in their respective `oauth-exchange.spec.ts` files, which test `exchangeGoogleCode` — a method that never reads `configService`. Those two files need a 5th mock constructor argument too, or they fail to compile/construct once the constructor gains its new parameter.

**Interfaces:**
- Consumes: `ConfigService<EnvironmentVariables, true>` (global, Task 2).
- Produces: both controllers' constructors gain a final `configService: ConfigService<EnvironmentVariables, true>` parameter.

- [ ] **Step 1: Update the failing tests first**

Edit `apps/api/src/customers/__tests__/customers-auth.controller.oauth-initiate.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { CustomersAuthController } from '../customers-auth.controller';
import type { EnvironmentVariables } from '../../config/env.validation';

// Regression coverage for the final-review finding C1: /google/initiate is
// unauthenticated and the returnUrl it accepts is where the OAuth callback
// later delivers a one-time code redeemable for a full token pair. Without an
// origin check it is an open redirect that leaks victim sessions.
function buildController() {
  const customersAuthService = {} as any;
  const cls = { get: jest.fn().mockReturnValue('tenant-1') } as any;
  const oauthState = {
    encode: jest.fn().mockReturnValue('signed-state'),
  } as any;
  const oneTimeCodeService = {} as any;
  const configService = {
    get: jest.fn(
      (key: string) =>
        ({
          GOOGLE_OAUTH_CLIENT_ID: 'test-client-id',
          PLATFORM_BASE_URL: 'https://platform.test',
        })[key],
    ),
  } as unknown as ConfigService<EnvironmentVariables, true>;

  const controller = new CustomersAuthController(
    customersAuthService,
    cls,
    oauthState,
    oneTimeCodeService,
    configService,
  );

  return { controller, oauthState };
}

// Only the fields the handler actually reads.
function fakeRequest(hostname: string, user?: unknown) {
  return { hostname, user } as any;
}
```

(Remove the `beforeAll(() => { process.env.GOOGLE_OAUTH_CLIENT_ID = ...; process.env.PLATFORM_BASE_URL = ...; })` block. Every `describe`/`it` block below stays unchanged.)

Apply the mirrored change to `apps/api/src/merchant-admins/__tests__/merchant-admins-auth.controller.oauth-initiate.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { MerchantAdminsAuthController } from '../merchant-admins-auth.controller';
import type { EnvironmentVariables } from '../../config/env.validation';

// Mirrors customers-auth.controller.oauth-initiate.spec.ts — regression
// coverage for final-review finding C1 (unauthenticated open redirect on the
// OAuth initiate endpoint leaking one-time codes to an attacker-chosen host).
function buildController() {
  const merchantAdminsAuthService = {} as any;
  const cls = { get: jest.fn().mockReturnValue('tenant-1') } as any;
  const oauthState = {
    encode: jest.fn().mockReturnValue('signed-state'),
  } as any;
  const oneTimeCodeService = {} as any;
  const configService = {
    get: jest.fn(
      (key: string) =>
        ({
          GOOGLE_OAUTH_CLIENT_ID: 'test-client-id',
          PLATFORM_BASE_URL: 'https://platform.test',
        })[key],
    ),
  } as unknown as ConfigService<EnvironmentVariables, true>;

  const controller = new MerchantAdminsAuthController(
    merchantAdminsAuthService,
    cls,
    oauthState,
    oneTimeCodeService,
    configService,
  );

  return { controller, oauthState };
}

function fakeRequest(hostname: string) {
  return { hostname } as any;
}
```

(Remove its `beforeAll` block too; the rest of the file is unchanged.)

Edit `apps/api/src/customers/__tests__/customers-auth.controller.oauth-exchange.spec.ts` — add a mock `configService` as the constructor's 5th argument:

```ts
  const controller = new CustomersAuthController(
    customersAuthService,
    cls,
    oauthState,
    oneTimeCodeService,
    { get: jest.fn() } as any,
  );
```

(Only the `new CustomersAuthController(...)` call inside `buildController` changes; everything else in the file — the function signature, `describe`/`it` blocks — stays unchanged.)

Edit `apps/api/src/merchant-admins/__tests__/merchant-admins-auth.controller.oauth-exchange.spec.ts` identically:

```ts
  const controller = new MerchantAdminsAuthController(
    merchantAdminsAuthService,
    cls,
    oauthState,
    oneTimeCodeService,
    { get: jest.fn() } as any,
  );
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @tiny-threads/api test -- oauth-initiate oauth-exchange`
Expected: FAIL — both controllers' constructors don't yet accept a fifth argument.

- [ ] **Step 3: Migrate the implementations**

Edit `apps/api/src/customers/customers-auth.controller.ts` to (only the imports, the constructor, and `googleAuthorizeUrl` at the bottom change — every other method is unchanged from today):

```ts
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import type { Request, Response } from 'express';
import { OAuthStateService } from '../auth-core/oauth-state.service';
import { assertReturnUrlMatchesRequestHost } from '../auth-core/return-url';
import { OneTimeCodeService } from '../oauth/one-time-code.service';
import { CustomersAuthService } from './customers-auth.service';
import { CustomerJwtAuthGuard } from './customer-jwt-auth.guard';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import { VerifyCustomerEmailDto } from './dto/verify-customer-email.dto';
import { CustomerOAuthInitiateDto } from './dto/customer-oauth-initiate.dto';
import { CustomerOAuthExchangeDto } from './dto/customer-oauth-exchange.dto';
import { RequestCustomerPasswordResetDto } from './dto/request-customer-password-reset.dto';
import { ResetCustomerPasswordDto } from './dto/reset-customer-password.dto';
import { EnvironmentVariables } from '../config/env.validation';

const REFRESH_COOKIE_NAME = 'customer_refresh_token';
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/customers/auth',
};

@Controller('customers/auth')
export class CustomersAuthController {
  constructor(
    private readonly customersAuthService: CustomersAuthService,
    private readonly cls: ClsService,
    private readonly oauthState: OAuthStateService,
    private readonly oneTimeCodeService: OneTimeCodeService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  @Post('register')
  register(@Body() dto: RegisterCustomerDto) {
    return this.customersAuthService.register(dto);
  }

  @Post('verify-email')
  @HttpCode(200)
  verifyEmail(@Body() dto: VerifyCustomerEmailDto) {
    return this.customersAuthService.verifyEmail(dto);
  }

  @UseGuards(AuthGuard('customer-local'))
  @Post('login')
  login(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken } = req.user as {
      accessToken: string;
      refreshToken: string;
    };
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);
    return { accessToken };
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // tenantId is resolved from CLS (set by TenantResolutionMiddleware from
    // the subdomain), not from client input — the refresh cookie alone
    // doesn't carry a tenant, and trusting a client-supplied body field here
    // would let a caller point a stolen/guessed refresh token lookup at a
    // different tenant than the one that actually issued it.
    const tenantId = this.cls.get<string>('tenantId');
    const rawRefreshToken = (
      req.cookies as Record<string, string> | undefined
    )?.[REFRESH_COOKIE_NAME];
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }
    const result = await this.customersAuthService.refresh(
      tenantId,
      rawRefreshToken,
    );
    res.cookie(
      REFRESH_COOKIE_NAME,
      result.refreshToken,
      REFRESH_COOKIE_OPTIONS,
    );
    return { accessToken: result.accessToken };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const tenantId = this.cls.get<string>('tenantId');
    const rawRefreshToken = (
      req.cookies as Record<string, string> | undefined
    )?.[REFRESH_COOKIE_NAME];
    if (rawRefreshToken) {
      await this.customersAuthService.logout(tenantId, rawRefreshToken);
    }
    res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_OPTIONS.path });
    return { success: true };
  }

  @Post('request-password-reset')
  @HttpCode(200)
  requestPasswordReset(@Body() dto: RequestCustomerPasswordResetDto) {
    return this.customersAuthService.requestPasswordReset(dto.email);
  }

  @Post('reset-password')
  @HttpCode(200)
  resetPassword(@Body() dto: ResetCustomerPasswordDto) {
    return this.customersAuthService.resetPassword(dto.token, dto.password);
  }

  @Post('google/initiate')
  initiateGoogle(@Req() req: Request, @Body() dto: CustomerOAuthInitiateDto) {
    // This endpoint is unauthenticated and the returnUrl it accepts is where
    // the callback later delivers a token-bearing one-time code — so it must
    // be pinned to this request's own (tenant-validated) host, or it's an open
    // redirect that hands victim sessions to an attacker. See return-url.ts.
    assertReturnUrlMatchesRequestHost(dto.returnUrl, req);
    const tenantId = this.cls.get<string>('tenantId');
    const state = this.oauthState.encode({
      population: 'customer',
      tenantId,
      returnUrl: dto.returnUrl,
      intent: 'login',
    });
    return { redirectUrl: this.googleAuthorizeUrl(state) };
  }

  @UseGuards(CustomerJwtAuthGuard)
  @Post('google/link/initiate')
  initiateGoogleLink(
    @Req() req: Request,
    @Body() dto: CustomerOAuthInitiateDto,
  ) {
    assertReturnUrlMatchesRequestHost(dto.returnUrl, req);
    const { sub: customerId, tenantId } = req.user as {
      sub: string;
      tenantId: string;
    };
    const state = this.oauthState.encode({
      population: 'customer',
      tenantId,
      returnUrl: dto.returnUrl,
      intent: 'link',
      linkCustomerId: customerId,
    });
    return { redirectUrl: this.googleAuthorizeUrl(state) };
  }

  // Exchanges the short-lived, single-use one-time code minted by
  // GoogleOAuthController's callback for the real token pair — the code
  // itself is safe to pass through a redirect URL (query param) since it's
  // opaque, expires in 60s, and is deleted on first read; the tokens it
  // unlocks never travel through a URL.
  @Post('google/exchange')
  @HttpCode(200)
  exchangeGoogleCode(
    @Body() dto: CustomerOAuthExchangeDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const payload = this.oneTimeCodeService.redeem(dto.code);
    // This route IS behind TenantResolutionMiddleware (unlike the Google
    // callback), so the redeeming request's own tenant is available in CLS.
    // A code is only honored if it was minted for THIS tenant — otherwise,
    // within its 60s TTL, a code obtained on one tenant's domain (e.g. from
    // a shared browser, a leaked Referer, or a race between tabs) could be
    // redeemed against a different tenant's exchange endpoint.
    const tenantId = this.cls.get<string>('tenantId');
    if (
      !payload ||
      payload.population !== 'customer' ||
      payload.tenantId !== tenantId
    ) {
      throw new BadRequestException('Invalid or expired code');
    }
    res.cookie(
      REFRESH_COOKIE_NAME,
      payload.refreshToken,
      REFRESH_COOKIE_OPTIONS,
    );
    return { accessToken: payload.accessToken };
  }

  private googleAuthorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.configService.get('GOOGLE_OAUTH_CLIENT_ID', {
        infer: true,
      }),
      redirect_uri: `${this.configService.get('PLATFORM_BASE_URL', { infer: true })}/auth/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }
}
```

`MerchantAdminsAuthController` has no separate `googleAuthorizeUrl` method — it builds the `URLSearchParams` inline inside `initiateGoogle`. Edit `apps/api/src/merchant-admins/merchant-admins-auth.controller.ts` to (only the imports, the constructor, and the inline `params` object inside `initiateGoogle` change — every other method is unchanged from today):

```ts
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import type { Request, Response } from 'express';
import { OAuthStateService } from '../auth-core/oauth-state.service';
import { assertReturnUrlMatchesRequestHost } from '../auth-core/return-url';
import { OneTimeCodeService } from '../oauth/one-time-code.service';
import { MerchantAdminsAuthService } from './merchant-admins-auth.service';
import { RegisterMerchantUserDto } from './dto/register-merchant-user.dto';
import { VerifyMerchantUserEmailDto } from './dto/verify-merchant-user-email.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { RequestMerchantUserPasswordResetDto } from './dto/request-merchant-user-password-reset.dto';
import { ResetMerchantUserPasswordDto } from './dto/reset-merchant-user-password.dto';
import { MerchantAdminOAuthExchangeDto } from './dto/merchant-admin-oauth-exchange.dto';
import { MerchantAdminOAuthInitiateDto } from './dto/merchant-admin-oauth-initiate.dto';
import { MerchantAdminJwtAuthGuard } from './merchant-admin-jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';
import type { MerchantAdminAccessTokenPayload } from '../auth-core/token.service';
import { EnvironmentVariables } from '../config/env.validation';

const REFRESH_COOKIE_NAME = 'merchant_admin_refresh_token';
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/merchant-admins/auth',
};

@Controller('merchant-admins/auth')
export class MerchantAdminsAuthController {
  constructor(
    private readonly merchantAdminsAuthService: MerchantAdminsAuthService,
    private readonly cls: ClsService,
    private readonly oauthState: OAuthStateService,
    private readonly oneTimeCodeService: OneTimeCodeService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  @Post('register')
  register(@Body() dto: RegisterMerchantUserDto) {
    return this.merchantAdminsAuthService.register(dto);
  }

  @Post('verify-email')
  @HttpCode(200)
  verifyEmail(@Body() dto: VerifyMerchantUserEmailDto) {
    return this.merchantAdminsAuthService.verifyEmail(dto);
  }

  // Only existing owners/admins can invite new members — this is now the
  // ONLY path by which a role gets granted (register() derives email/role
  // from the invite it redeems, never from client input). MerchantAdminJwtAuthGuard
  // authenticates the caller; RolesGuard + @Roles enforces the caller
  // already holds one of these roles for this tenant. RolesGuard alone
  // doesn't stop an 'admin' from inviting someone in as 'owner' though —
  // that's enforced by inviteMember() itself via the caller's own role
  // (invitedByRole), passed through here from the verified JWT.
  @UseGuards(MerchantAdminJwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Post('invite')
  @HttpCode(200)
  async invite(@Req() req: Request, @Body() dto: InviteMemberDto) {
    const {
      sub: invitedByMerchantUserId,
      tenantId,
      role: invitedByRole,
    } = req.user as MerchantAdminAccessTokenPayload;
    await this.merchantAdminsAuthService.inviteMember({
      tenantId,
      invitedByMerchantUserId,
      invitedByRole,
      email: dto.email,
      role: dto.role,
    });
    return { success: true };
  }

  @UseGuards(AuthGuard('merchant-admin-local'))
  @Post('login')
  login(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken } = req.user as {
      accessToken: string;
      refreshToken: string;
    };
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);
    return { accessToken };
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // tenantId is resolved from CLS (set by TenantResolutionMiddleware from
    // the subdomain), not from client input — the refresh cookie alone
    // doesn't carry a tenant, and trusting a client-supplied body field here
    // would let a caller point a stolen/guessed refresh token lookup at a
    // different tenant than the one that actually issued it.
    const tenantId = this.cls.get<string>('tenantId');
    const rawRefreshToken = (
      req.cookies as Record<string, string> | undefined
    )?.[REFRESH_COOKIE_NAME];
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }
    const result = await this.merchantAdminsAuthService.refresh(
      tenantId,
      rawRefreshToken,
    );
    res.cookie(
      REFRESH_COOKIE_NAME,
      result.refreshToken,
      REFRESH_COOKIE_OPTIONS,
    );
    return { accessToken: result.accessToken };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const tenantId = this.cls.get<string>('tenantId');
    const rawRefreshToken = (
      req.cookies as Record<string, string> | undefined
    )?.[REFRESH_COOKIE_NAME];
    if (rawRefreshToken) {
      await this.merchantAdminsAuthService.logout(tenantId, rawRefreshToken);
    }
    res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_OPTIONS.path });
    return { success: true };
  }

  @Post('request-password-reset')
  @HttpCode(200)
  requestPasswordReset(@Body() dto: RequestMerchantUserPasswordResetDto) {
    return this.merchantAdminsAuthService.requestPasswordReset(dto.email);
  }

  @Post('reset-password')
  @HttpCode(200)
  resetPassword(@Body() dto: ResetMerchantUserPasswordDto) {
    return this.merchantAdminsAuthService.resetPassword(
      dto.token,
      dto.password,
    );
  }

  // Merchant admins don't self-register via OAuth (see
  // MerchantAdminsAuthService.findOrCreateFromGoogle), so there's no
  // link-initiate counterpart here — just login.
  @Post('google/initiate')
  initiateGoogle(
    @Req() req: Request,
    @Body() dto: MerchantAdminOAuthInitiateDto,
  ) {
    // This endpoint is unauthenticated and the returnUrl it accepts is where
    // the callback later delivers a token-bearing one-time code — so it must
    // be pinned to this request's own (tenant-validated) host, or it's an open
    // redirect that hands victim sessions to an attacker. See return-url.ts.
    assertReturnUrlMatchesRequestHost(dto.returnUrl, req);
    const tenantId = this.cls.get<string>('tenantId');
    const state = this.oauthState.encode({
      population: 'merchant_admin',
      tenantId,
      returnUrl: dto.returnUrl,
      intent: 'login',
    });
    const params = new URLSearchParams({
      client_id: this.configService.get('GOOGLE_OAUTH_CLIENT_ID', {
        infer: true,
      }),
      redirect_uri: `${this.configService.get('PLATFORM_BASE_URL', { infer: true })}/auth/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      state,
    });
    return {
      redirectUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    };
  }

  // Exchanges the short-lived, single-use one-time code minted by
  // GoogleOAuthController's callback for the real token pair — mirrors
  // CustomersAuthController#exchangeGoogleCode exactly (see there for the
  // full rationale on why tokens travel via this code rather than the
  // redirect URL itself).
  @Post('google/exchange')
  @HttpCode(200)
  exchangeGoogleCode(
    @Body() dto: MerchantAdminOAuthExchangeDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const payload = this.oneTimeCodeService.redeem(dto.code);
    // This route IS behind TenantResolutionMiddleware (unlike the Google
    // callback), so the redeeming request's own tenant is available in CLS.
    // A code is only honored if it was minted for THIS tenant — otherwise,
    // within its 60s TTL, a code obtained on one tenant's domain could be
    // redeemed against a different tenant's exchange endpoint.
    const tenantId = this.cls.get<string>('tenantId');
    if (
      !payload ||
      payload.population !== 'merchant_admin' ||
      payload.tenantId !== tenantId
    ) {
      throw new BadRequestException('Invalid or expired code');
    }
    res.cookie(
      REFRESH_COOKIE_NAME,
      payload.refreshToken,
      REFRESH_COOKIE_OPTIONS,
    );
    return { accessToken: payload.accessToken };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @tiny-threads/api test -- oauth-initiate oauth-exchange`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/customers/customers-auth.controller.ts apps/api/src/customers/__tests__/customers-auth.controller.oauth-initiate.spec.ts apps/api/src/customers/__tests__/customers-auth.controller.oauth-exchange.spec.ts apps/api/src/merchant-admins/merchant-admins-auth.controller.ts apps/api/src/merchant-admins/__tests__/merchant-admins-auth.controller.oauth-initiate.spec.ts apps/api/src/merchant-admins/__tests__/merchant-admins-auth.controller.oauth-exchange.spec.ts
git commit -m "refactor(config): migrate auth controllers' Google authorize URL to ConfigService"
```

---

### Task 10: Final verification

**Files:**
- None (verification only).

- [ ] **Step 1: Confirm no `process.env` reads remain outside `env.validation.ts`/`data-source.ts`**

Run: `grep -rn "process\.env" apps/api/src --include="*.ts" | grep -v "__tests__\|\.spec\.ts\|config/env.validation.ts\|db/data-source.ts\|main.ts"`
Expected: no output (the only remaining `process.env` reads in non-test source are inside `main.ts`'s `dotenv.config()`/repo-root path setup, `data-source.ts`'s `dotenv.config()`/`validate(process.env)`, and `env.validation.ts` itself).

- [ ] **Step 2: Run the full unit test suite**

Run: `pnpm --filter @tiny-threads/api test`
Expected: PASS, all suites green.

- [ ] **Step 3: Run lint**

Run: `pnpm --filter @tiny-threads/api lint`
Expected: no errors.

- [ ] **Step 4: Run the build**

Run: `pnpm --filter @tiny-threads/api build`
Expected: succeeds with no TypeScript errors.

- [ ] **Step 5: Run e2e tests**

Run: `pnpm --filter @tiny-threads/api test:e2e` (requires local Postgres running via `docker compose up -d` and a filled-in `.env`)
Expected: PASS.

- [ ] **Step 6: Manual boot smoke test**

Run: `pnpm --filter @tiny-threads/api start:dev`, confirm it starts cleanly and logs the listening port, then stop it. As an extra check, temporarily comment out `JWT_SECRET` in your local `.env`, restart, and confirm the app now fails immediately at boot with a `class-validator` error naming `JWT_SECRET` — then restore `.env` and confirm it boots cleanly again.

No commit for this task — it's verification only. If any step fails, return to the relevant earlier task and fix it there (with its own commit) rather than committing a fix here.
