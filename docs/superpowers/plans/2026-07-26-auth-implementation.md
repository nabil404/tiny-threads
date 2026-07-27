# Authentication & Authorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement email/password + Google OAuth authentication for both auth populations in Tiny Threads — tenant-scoped `customers` and tenant-scoped `merchant_users` — per `docs/superpowers/specs/2026-07-26-auth-design.md`.

**Architecture:** A shared `auth-core` module (hashing, JWT signing, refresh-token crypto, signed OAuth `state`, a `NotificationsPort`) is consumed by two structurally-parallel but separately-tabled auth contexts: `Customers` (builds on the existing `customers` table) and `MerchantAdmins` (builds on the existing `merchant_users` table). Both are tenant-scoped under RLS. A new `TenantResolutionMiddleware` (missing today) resolves `tenant_id` into CLS before any auth guard runs.

**Tech Stack:** NestJS 11 · TypeORM · PostgreSQL · Passport (`passport-local`, `passport-google-oauth20`) · `@nestjs/jwt` · `argon2` · `class-validator`/`class-transformer` · Jest.

## Global Constraints

- Tenant-scoped tables carry `tenant_id`, RLS `ENABLE`d + `FORCE`d + policy (via `enableRls`/`disableRls` from `src/db/migrations/helpers/rls.helper.ts`), composite PK `(tenant_id, id)`.
- All tenant-scoped queries go through `TenantDbService.run(work)` (wraps `withTenant`) — never inject `DataSource`/`EntityManager` directly for tenant tables.
- Primary keys are UUID v7, generated via the existing `@BeforeInsert() generateId()` pattern on the base entity classes — new entities extend `ImmutableTenantEntityBase` (tenant-scoped, `created_at` only, no `updated_at`) unless a task says otherwise.
- New entities are registered by adding `export * from './x.entity'` to `apps/api/src/db/entities/index.ts` — nowhere else.
- Migrations are **generated**, not hand-written: define entities first, then run `pnpm db:generate <Name>` from `apps/api`, then hand-edit the generated file to insert `enableRls`/`disableRls` calls adjacent to each table's `CREATE TABLE`/`DROP TABLE` (see the existing `1785070807145-InitialMigration.ts` for the pattern). Run `pnpm db:migrate` to apply + auto-verify RLS.
- Password hashing: **argon2id** only. Refresh tokens: opaque random values, stored **hashed** (sha256 is fine — these are high-entropy random tokens, not passwords), never the raw token.
- Access tokens are JWTs (~15 min) with an `aud` field (`'customer'` or `'merchant_admin'`) plus `tenantId`; `aud` must be checked on every protected route.
- Refresh tokens are transported as `httpOnly`, `Secure`, `SameSite=Lax` cookies; access tokens are returned in the response body only.
- Unit tests for `apps/api` go in `__tests__/` directories alongside the code under test, not colocated as `*.spec.ts` next to the source file (e.g. `src/auth-core/__tests__/hashing.service.spec.ts`, not `src/auth-core/hashing.service.spec.ts`).
- `platform_admins` auth is out of scope — do not touch that table/entity in this plan.

---

## Task 1: Tenant resolution middleware (CLS foundation)

**Files:**
- Modify: `apps/api/src/db/database.module.ts`
- Create: `apps/api/src/tenancy/tenant-resolution.middleware.ts`
- Create: `apps/api/src/tenancy/__tests__/tenant-resolution.middleware.spec.ts`
- Modify: `apps/api/src/app/app.module.ts`

**Interfaces:**
- Produces: `TenantResolutionMiddleware` (NestMiddleware) — every later guard/service that calls `TenantDbService.run(...)` or reads `cls.get<string>('tenantId')` depends on this having run first for tenant-scoped routes.

Today `ClsModule.forRoot({ global: true })` does not mount `ClsMiddleware`, so `cls.get('tenantId')` currently has no active CLS context to read from at all — this must be fixed before anything else in this plan can work.

- [ ] **Step 1: Enable CLS request-scoping**

In `apps/api/src/db/database.module.ts`, change:

```ts
ClsModule.forRoot({ global: true }),
```

to:

```ts
ClsModule.forRoot({ global: true, middleware: { mount: true } }),
```

- [ ] **Step 2: Write the failing test**

```ts
// apps/api/src/tenancy/__tests__/tenant-resolution.middleware.spec.ts
import { NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { TenantResolutionMiddleware } from '../tenant-resolution.middleware';

describe('TenantResolutionMiddleware', () => {
  function buildMiddleware(tenant: { id: string; slug: string } | null) {
    const findOne = jest.fn().mockResolvedValue(tenant);
    const dataSource = {
      getRepository: jest.fn().mockReturnValue({ findOne }),
    } as unknown as DataSource;
    const cls = { set: jest.fn() } as unknown as ClsService;
    return { middleware: new TenantResolutionMiddleware(dataSource, cls), cls, findOne };
  }

  it('resolves tenant from the request subdomain and sets it in CLS', async () => {
    const { middleware, cls, findOne } = buildMiddleware({ id: 'tenant-1', slug: 'shop' });
    const req = { hostname: 'shop.platform.com' } as any;
    const next = jest.fn();

    await middleware.use(req, {} as any, next);

    expect(findOne).toHaveBeenCalledWith({ where: { slug: 'shop' } });
    expect(cls.set).toHaveBeenCalledWith('tenantId', 'tenant-1');
    expect(next).toHaveBeenCalled();
  });

  it('throws NotFoundException when no tenant matches the subdomain', async () => {
    const { middleware } = buildMiddleware(null);
    const req = { hostname: 'unknown.platform.com' } as any;

    await expect(middleware.use(req, {} as any, jest.fn())).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/api test -- tenant-resolution.middleware -v`
Expected: FAIL — `Cannot find module '../tenant-resolution.middleware'`

- [ ] **Step 4: Write the implementation**

```ts
// apps/api/src/tenancy/tenant-resolution.middleware.ts
import { Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { NextFunction, Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { Tenant } from '../db/entities';

// Resolves tenant_id from the request's subdomain (e.g. "shop.platform.com"
// -> slug "shop") and sets it in CLS for withTenant()/TenantDbService to
// read. Custom-domain resolution is a known follow-up, not implemented here.
@Injectable()
export class TenantResolutionMiddleware implements NestMiddleware {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cls: ClsService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const slug = req.hostname.split('.')[0];
    const tenant = await this.dataSource.getRepository(Tenant).findOne({ where: { slug } });
    if (!tenant) {
      throw new NotFoundException('Unknown tenant');
    }
    this.cls.set('tenantId', tenant.id);
    next();
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/api test -- tenant-resolution.middleware -v`
Expected: PASS (2 tests)

- [ ] **Step 6: Wire the middleware into AppModule, excluding the central OAuth callback**

The centralized Google OAuth callback (Task 11/14) lives at `auth/google/callback` on the platform's own domain (no tenant subdomain) — it must be excluded from tenant resolution. All customer/merchant-admin auth routes are tenant-scoped and need it.

```ts
// apps/api/src/app/app.module.ts
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from '../db/database.module';
import { TenantResolutionMiddleware } from '../tenancy/tenant-resolution.middleware';

@Module({
  imports: [DatabaseModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantResolutionMiddleware)
      .exclude({ path: 'auth/google/callback', method: RequestMethod.GET })
      .forRoutes('*');
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/db/database.module.ts apps/api/src/tenancy apps/api/src/app/app.module.ts
git commit -m "feat(auth): add tenant resolution middleware and enable CLS request scoping"
```

---

## Task 2: auth-core — HashingService (argon2id)

**Files:**
- Modify: `apps/api/package.json` (add `argon2` dependency)
- Create: `apps/api/src/auth-core/hashing.service.ts`
- Create: `apps/api/src/auth-core/__tests__/hashing.service.spec.ts`

**Interfaces:**
- Produces: `HashingService` with `hash(plaintext: string): Promise<string>` and `verify(hash: string, plaintext: string): Promise<boolean>` — used by both Customers and MerchantAdmins register/login flows (Tasks 9, 10, 13).

- [ ] **Step 1: Install argon2**

Run: `pnpm --filter @tiny-threads/api add argon2`

- [ ] **Step 2: Write the failing test**

```ts
// apps/api/src/auth-core/__tests__/hashing.service.spec.ts
import { HashingService } from '../hashing.service';

describe('HashingService', () => {
  const service = new HashingService();

  it('hashes a plaintext value into something other than the plaintext', async () => {
    const hash = await service.hash('correct horse battery staple');
    expect(hash).not.toEqual('correct horse battery staple');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('verifies a matching plaintext against its hash', async () => {
    const hash = await service.hash('correct horse battery staple');
    await expect(service.verify(hash, 'correct horse battery staple')).resolves.toBe(true);
  });

  it('rejects a non-matching plaintext', async () => {
    const hash = await service.hash('correct horse battery staple');
    await expect(service.verify(hash, 'wrong password')).resolves.toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/api test -- hashing.service -v`
Expected: FAIL — `Cannot find module '../hashing.service'`

- [ ] **Step 4: Write the implementation**

```ts
// apps/api/src/auth-core/hashing.service.ts
import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

@Injectable()
export class HashingService {
  hash(plaintext: string): Promise<string> {
    return argon2.hash(plaintext, { type: argon2.argon2id });
  }

  verify(hash: string, plaintext: string): Promise<boolean> {
    return argon2.verify(hash, plaintext);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/api test -- hashing.service -v`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/api/package.json apps/api/pnpm-lock.yaml apps/api/src/auth-core/hashing.service.ts apps/api/src/auth-core/__tests__/hashing.service.spec.ts
git commit -m "feat(auth-core): add argon2id HashingService"
```

---

## Task 3: auth-core — NotificationsPort + LogNotificationsAdapter

**Files:**
- Create: `apps/api/src/auth-core/notifications/notifications-port.ts`
- Create: `apps/api/src/auth-core/notifications/log-notifications.adapter.ts`
- Create: `apps/api/src/auth-core/notifications/__tests__/log-notifications.adapter.spec.ts`

**Interfaces:**
- Produces: `NotificationsPort` interface, `NOTIFICATIONS_PORT` DI token, `EmailTemplate` type (`'verification-email' | 'password-reset'`), `LogNotificationsAdapter` — consumed by Customers/MerchantAdmins register + password-reset flows (Tasks 9, 13).

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/auth-core/notifications/__tests__/log-notifications.adapter.spec.ts
import { LogNotificationsAdapter } from '../log-notifications.adapter';

describe('LogNotificationsAdapter', () => {
  it('logs the email send and resolves', async () => {
    const adapter = new LogNotificationsAdapter();
    const logSpy = jest.spyOn((adapter as any).logger, 'log').mockImplementation(() => undefined);

    await expect(
      adapter.sendEmail('user@example.com', 'verification-email', { token: 'abc' }),
    ).resolves.toBeUndefined();

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('user@example.com'),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/api test -- log-notifications.adapter -v`
Expected: FAIL — `Cannot find module '../log-notifications.adapter'`

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/src/auth-core/notifications/notifications-port.ts
export type EmailTemplate = 'verification-email' | 'password-reset';

export interface NotificationsPort {
  sendEmail(to: string, template: EmailTemplate, data: Record<string, unknown>): Promise<void>;
}

export const NOTIFICATIONS_PORT = Symbol('NOTIFICATIONS_PORT');
```

```ts
// apps/api/src/auth-core/notifications/log-notifications.adapter.ts
import { Injectable, Logger } from '@nestjs/common';
import { EmailTemplate, NotificationsPort } from './notifications-port';

@Injectable()
export class LogNotificationsAdapter implements NotificationsPort {
  private readonly logger = new Logger(LogNotificationsAdapter.name);

  async sendEmail(
    to: string,
    template: EmailTemplate,
    data: Record<string, unknown>,
  ): Promise<void> {
    this.logger.log(`sendEmail to=${to} template=${template} data=${JSON.stringify(data)}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/api test -- log-notifications.adapter -v`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth-core/notifications
git commit -m "feat(auth-core): add NotificationsPort with a log adapter"
```

---

## Task 4: auth-core — TokenService (access token sign/verify)

**Files:**
- Modify: `apps/api/package.json` (add `@nestjs/jwt`)
- Create: `apps/api/src/auth-core/token.service.ts`
- Create: `apps/api/src/auth-core/__tests__/token.service.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface CustomerAccessTokenPayload {
    sub: string;
    aud: 'customer';
    tenantId: string;
  }
  export interface MerchantAdminAccessTokenPayload {
    sub: string;
    aud: 'merchant_admin';
    tenantId: string;
    role: string;
  }
  export type AccessTokenPayload = CustomerAccessTokenPayload | MerchantAdminAccessTokenPayload;

  class TokenService {
    signAccessToken(payload: AccessTokenPayload): string;
    verifyAccessToken(token: string): AccessTokenPayload; // throws on invalid/expired
  }
  ```
  Used by Customers/MerchantAdmins login/refresh services (Tasks 10, 13) and their JWT Passport strategies.

- [ ] **Step 1: Install @nestjs/jwt**

Run: `pnpm --filter @tiny-threads/api add @nestjs/jwt`

- [ ] **Step 2: Write the failing test**

```ts
// apps/api/src/auth-core/__tests__/token.service.spec.ts
import { JwtService } from '@nestjs/jwt';
import { TokenService } from '../token.service';

describe('TokenService', () => {
  const jwtService = new JwtService({ secret: 'test-secret' });
  const service = new TokenService(jwtService);

  it('round-trips a customer access token', () => {
    const token = service.signAccessToken({ sub: 'cust-1', aud: 'customer', tenantId: 'tenant-1' });
    const payload = service.verifyAccessToken(token);
    expect(payload).toMatchObject({ sub: 'cust-1', aud: 'customer', tenantId: 'tenant-1' });
  });

  it('round-trips a merchant admin access token with a role claim', () => {
    const token = service.signAccessToken({
      sub: 'mu-1',
      aud: 'merchant_admin',
      tenantId: 'tenant-1',
      role: 'owner',
    });
    const payload = service.verifyAccessToken(token);
    expect(payload).toMatchObject({ sub: 'mu-1', aud: 'merchant_admin', tenantId: 'tenant-1', role: 'owner' });
  });

  it('throws on a tampered token', () => {
    const token = service.signAccessToken({ sub: 'cust-1', aud: 'customer', tenantId: 'tenant-1' });
    expect(() => service.verifyAccessToken(token + 'x')).toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/api test -- token.service -v`
Expected: FAIL — `Cannot find module '../token.service'`

- [ ] **Step 4: Write the implementation**

```ts
// apps/api/src/auth-core/token.service.ts
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface CustomerAccessTokenPayload {
  sub: string;
  aud: 'customer';
  tenantId: string;
}

export interface MerchantAdminAccessTokenPayload {
  sub: string;
  aud: 'merchant_admin';
  tenantId: string;
  role: string;
}

export type AccessTokenPayload = CustomerAccessTokenPayload | MerchantAdminAccessTokenPayload;

@Injectable()
export class TokenService {
  constructor(private readonly jwtService: JwtService) {}

  signAccessToken(payload: AccessTokenPayload): string {
    return this.jwtService.sign(payload, { expiresIn: '15m' });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    return this.jwtService.verify<AccessTokenPayload>(token);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/api test -- token.service -v`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/api/package.json apps/api/pnpm-lock.yaml apps/api/src/auth-core/token.service.ts apps/api/src/auth-core/__tests__/token.service.spec.ts
git commit -m "feat(auth-core): add TokenService for signing/verifying access tokens"
```

---

## Task 5: auth-core — refresh token crypto utilities

**Files:**
- Create: `apps/api/src/auth-core/refresh-token-crypto.ts`
- Create: `apps/api/src/auth-core/__tests__/refresh-token-crypto.spec.ts`

**Interfaces:**
- Produces: `generateOpaqueRefreshToken(): string`, `hashRefreshToken(token: string): string` — used by Customers/MerchantAdmins refresh-token rotation logic (Tasks 10, 13). Deliberately plain functions, not a service — each auth context owns its own rotation logic against its own tenant-scoped table (see Task 10), this module only supplies the crypto primitives so both contexts hash identically.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/auth-core/__tests__/refresh-token-crypto.spec.ts
import { generateOpaqueRefreshToken, hashRefreshToken } from '../refresh-token-crypto';

describe('refresh token crypto', () => {
  it('generates distinct high-entropy opaque tokens', () => {
    const a = generateOpaqueRefreshToken();
    const b = generateOpaqueRefreshToken();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });

  it('hashes deterministically for the same input', () => {
    const token = 'fixed-token-value';
    expect(hashRefreshToken(token)).toEqual(hashRefreshToken(token));
  });

  it('never returns the raw token as the hash', () => {
    const token = generateOpaqueRefreshToken();
    expect(hashRefreshToken(token)).not.toEqual(token);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/api test -- refresh-token-crypto -v`
Expected: FAIL — `Cannot find module '../refresh-token-crypto'`

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/src/auth-core/refresh-token-crypto.ts
import { createHash, randomBytes } from 'node:crypto';

export function generateOpaqueRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/api test -- refresh-token-crypto -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth-core/refresh-token-crypto.ts apps/api/src/auth-core/__tests__/refresh-token-crypto.spec.ts
git commit -m "feat(auth-core): add opaque refresh token generation/hashing utilities"
```

---

## Task 6: auth-core — OAuthStateService (signed state)

**Files:**
- Create: `apps/api/src/auth-core/oauth-state.service.ts`
- Create: `apps/api/src/auth-core/__tests__/oauth-state.service.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface OAuthState {
    population: 'customer' | 'merchant_admin';
    tenantId: string;
    returnUrl: string;
    intent: 'login' | 'link';
    linkCustomerId?: string; // set only when intent === 'link', for Customers linking (Task 11)
    nonce: string;
  }
  class OAuthStateService {
    encode(state: Omit<OAuthState, 'nonce'>): string;
    decode(token: string): OAuthState; // throws BadRequestException on tampering
  }
  ```
  Used by Customers/MerchantAdmins Google OAuth flows (Tasks 11, 14).

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/auth-core/__tests__/oauth-state.service.spec.ts
import { BadRequestException } from '@nestjs/common';
import { OAuthStateService } from '../oauth-state.service';

describe('OAuthStateService', () => {
  const originalSecret = process.env.OAUTH_STATE_SECRET;

  beforeAll(() => {
    process.env.OAUTH_STATE_SECRET = 'test-oauth-state-secret';
  });

  afterAll(() => {
    process.env.OAUTH_STATE_SECRET = originalSecret;
  });

  it('round-trips a state payload', () => {
    const service = new OAuthStateService();
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
    const service = new OAuthStateService();
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

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/api test -- oauth-state.service -v`
Expected: FAIL — `Cannot find module '../oauth-state.service'`

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/src/auth-core/oauth-state.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

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

  constructor() {
    const secret = process.env.OAUTH_STATE_SECRET;
    if (!secret) {
      throw new Error('OAUTH_STATE_SECRET is not set');
    }
    this.secret = secret;
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
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as OAuthState;
  }

  private isValidSignature(payload: string, signature: string): boolean {
    const expected = Buffer.from(this.sign(payload));
    const actual = Buffer.from(signature);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('base64url');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/api test -- oauth-state.service -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth-core/oauth-state.service.ts apps/api/src/auth-core/__tests__/oauth-state.service.spec.ts
git commit -m "feat(auth-core): add signed OAuth state encode/decode"
```

---

## Task 7: auth-core module wiring + global validation pipe

**Files:**
- Modify: `apps/api/package.json` (add `class-validator`, `class-transformer`)
- Create: `apps/api/src/auth-core/auth-core.module.ts`
- Modify: `apps/api/src/main.ts`
- Create: `apps/api/src/auth-core/__tests__/auth-core.module.spec.ts`

**Interfaces:**
- Produces: `AuthCoreModule` (exports `HashingService`, `TokenService`, `OAuthStateService`, `NOTIFICATIONS_PORT`, and `JwtModule`) — imported by `CustomersModule` (Task 9) and `MerchantAdminsModule` (Task 13). Requires env vars `JWT_SECRET` and `OAUTH_STATE_SECRET`.

- [ ] **Step 1: Install class-validator/class-transformer**

Run: `pnpm --filter @tiny-threads/api add class-validator class-transformer`

- [ ] **Step 2: Write the failing test**

```ts
// apps/api/src/auth-core/__tests__/auth-core.module.spec.ts
import { Test } from '@nestjs/testing';
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
    const moduleRef = await Test.createTestingModule({ imports: [AuthCoreModule] }).compile();

    expect(moduleRef.get(HashingService)).toBeInstanceOf(HashingService);
    expect(moduleRef.get(TokenService)).toBeInstanceOf(TokenService);
    expect(moduleRef.get(OAuthStateService)).toBeInstanceOf(OAuthStateService);
    expect(moduleRef.get(NOTIFICATIONS_PORT)).toBeDefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/api test -- auth-core.module -v`
Expected: FAIL — `Cannot find module '../auth-core.module'`

- [ ] **Step 4: Write the implementation**

```ts
// apps/api/src/auth-core/auth-core.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { HashingService } from './hashing.service';
import { TokenService } from './token.service';
import { OAuthStateService } from './oauth-state.service';
import { NOTIFICATIONS_PORT } from './notifications/notifications-port';
import { LogNotificationsAdapter } from './notifications/log-notifications.adapter';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
          throw new Error('JWT_SECRET is not set');
        }
        return { secret };
      },
    }),
  ],
  providers: [
    HashingService,
    TokenService,
    OAuthStateService,
    { provide: NOTIFICATIONS_PORT, useClass: LogNotificationsAdapter },
  ],
  exports: [JwtModule, HashingService, TokenService, OAuthStateService, NOTIFICATIONS_PORT],
})
export class AuthCoreModule {}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/api test -- auth-core.module -v`
Expected: PASS (1 test)

- [ ] **Step 6: Enable global validation for DTOs**

```ts
// apps/api/src/main.ts
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../../../../.env') });

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
```

- [ ] **Step 7: Add required env vars to `.env.example`**

Append to `.env.example`:

```
JWT_SECRET=
OAUTH_STATE_SECRET=
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/package.json apps/api/pnpm-lock.yaml apps/api/src/auth-core/auth-core.module.ts apps/api/src/auth-core/__tests__/auth-core.module.spec.ts apps/api/src/main.ts .env.example
git commit -m "feat(auth-core): wire AuthCoreModule and enable global ValidationPipe"
```

---

## Task 8: DB — customer auth entities, migration, RLS

**Files:**
- Create: `apps/api/src/db/entities/customer-identities.entity.ts`
- Create: `apps/api/src/db/entities/customer-refresh-tokens.entity.ts`
- Modify: `apps/api/src/db/entities/index.ts`
- Create (generated): `apps/api/src/db/migrations/<timestamp>-AddCustomerAuthTables.ts`
- Create: `apps/api/src/db/__tests__/entity-metadata.spec.ts` (modify existing — add new table names)

**Interfaces:**
- Produces: `CustomerIdentity` entity (`tenantId`, `id`, `customerId`, `provider`, `providerSubject`, `passwordHash`, `emailVerified`, `verificationTokenHash`, `verificationTokenExpiresAt`, `passwordResetTokenHash`, `passwordResetTokenExpiresAt`, `createdAt`) and `CustomerRefreshToken` entity (`tenantId`, `id`, `customerId`, `tokenHash`, `familyId`, `expiresAt`, `revokedAt`, `createdAt`) — consumed by `CustomersAuthService` (Tasks 9, 10, 11).

- [ ] **Step 1: Write the entity for `customer_identities`**

```ts
// apps/api/src/db/entities/customer-identities.entity.ts
import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { ImmutableTenantEntityBase } from './base';
import { Customer } from './customers.entity';

@Entity({ name: 'customer_identities' })
@Index('customer_identities_tenant_customer_idx', ['tenantId', 'customerId'])
@Unique('customer_identities_tenant_provider_subject_uq', ['tenantId', 'provider', 'providerSubject'])
@Unique('customer_identities_tenant_customer_provider_uq', ['tenantId', 'customerId', 'provider'])
export class CustomerIdentity extends ImmutableTenantEntityBase {
  @ManyToOne(() => Customer)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'customer_id', referencedColumnName: 'id' },
  ])
  customer?: Customer;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ type: 'text' })
  provider!: 'password' | 'google';

  @Column({ name: 'provider_subject', type: 'text', nullable: true })
  providerSubject!: string | null;

  @Column({ name: 'password_hash', type: 'text', nullable: true })
  passwordHash!: string | null;

  @Column({ name: 'email_verified', type: 'boolean', default: false })
  emailVerified!: boolean;

  @Column({ name: 'verification_token_hash', type: 'text', nullable: true })
  verificationTokenHash!: string | null;

  @Column({ name: 'verification_token_expires_at', type: 'timestamptz', nullable: true })
  verificationTokenExpiresAt!: Date | null;

  @Column({ name: 'password_reset_token_hash', type: 'text', nullable: true })
  passwordResetTokenHash!: string | null;

  @Column({ name: 'password_reset_token_expires_at', type: 'timestamptz', nullable: true })
  passwordResetTokenExpiresAt!: Date | null;
}
```

- [ ] **Step 2: Write the entity for `customer_refresh_tokens`**

```ts
// apps/api/src/db/entities/customer-refresh-tokens.entity.ts
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ImmutableTenantEntityBase } from './base';
import { Customer } from './customers.entity';

@Entity({ name: 'customer_refresh_tokens' })
@Index('customer_refresh_tokens_tenant_customer_idx', ['tenantId', 'customerId'])
@Index('customer_refresh_tokens_tenant_family_idx', ['tenantId', 'familyId'])
export class CustomerRefreshToken extends ImmutableTenantEntityBase {
  @ManyToOne(() => Customer)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'customer_id', referencedColumnName: 'id' },
  ])
  customer?: Customer;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ name: 'token_hash', type: 'text' })
  tokenHash!: string;

  @Column({ name: 'family_id', type: 'uuid' })
  familyId!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;
}
```

- [ ] **Step 3: Register the new entities**

Add to `apps/api/src/db/entities/index.ts`, under the tenant-scoped section:

```ts
export * from './customer-identities.entity';
export * from './customer-refresh-tokens.entity';
```

- [ ] **Step 4: Generate the migration**

Run (from `apps/api`, with local Postgres up via `docker compose up -d` and `.env` configured):

```bash
pnpm db:generate AddCustomerAuthTables
```

This diffs the new entities against the DB and writes `src/db/migrations/<timestamp>-AddCustomerAuthTables.ts` with the `CREATE TABLE`/index/FK statements for `customer_identities` and `customer_refresh_tokens`.

- [ ] **Step 5: Hand-edit the generated migration to add RLS**

Open the generated file. Add the import and insert `enableRls`/`disableRls` calls immediately adjacent to each table's `CREATE TABLE`/`DROP TABLE`, following the pattern in `1785070807145-InitialMigration.ts`:

```ts
import { enableRls, disableRls } from './helpers/rls.helper';
```

In `up()`, right after both `CREATE TABLE` statements (and after any FK constraints referencing these two tables, matching the existing migration's comment about FK validation running under RLS):

```ts
await enableRls(queryRunner, 'customer_identities');
await enableRls(queryRunner, 'customer_refresh_tokens');
```

In `down()`, right before the corresponding `DROP TABLE` statements:

```ts
await disableRls(queryRunner, 'customer_refresh_tokens');
await disableRls(queryRunner, 'customer_identities');
```

- [ ] **Step 6: Run the migration**

Run: `pnpm db:migrate`
Expected: migration applies, then `db:verify-rls` passes (both new tables report RLS `ENABLE`d + `FORCE`d + a policy). If verification fails, the script auto-reverts — fix the RLS calls from Step 5 and retry.

- [ ] **Step 7: Update the entity-metadata test**

Add `'customer_identities'` and `'customer_refresh_tokens'` to the table-name list in `apps/api/src/db/__tests__/entity-metadata.spec.ts` (alongside the existing tenant-scoped entries).

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm --filter @tiny-threads/api test -- entity-metadata -v`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/db/entities/customer-identities.entity.ts apps/api/src/db/entities/customer-refresh-tokens.entity.ts apps/api/src/db/entities/index.ts apps/api/src/db/migrations apps/api/src/db/__tests__/entity-metadata.spec.ts
git commit -m "feat(db): add customer_identities and customer_refresh_tokens tables with RLS"
```

---

## Task 9: Customers — register + email verification

**Files:**
- Create: `apps/api/src/customers/dto/register-customer.dto.ts`
- Create: `apps/api/src/customers/dto/verify-customer-email.dto.ts`
- Create: `apps/api/src/customers/customers-auth.service.ts`
- Create: `apps/api/src/customers/customers-auth.controller.ts`
- Create: `apps/api/src/customers/customers-auth.module.ts`
- Create: `apps/api/src/customers/__tests__/customers-auth.service.spec.ts`

**Interfaces:**
- Consumes: `TenantDbService.run(work)`, `HashingService.hash`/`verify`, `NOTIFICATIONS_PORT.sendEmail`, `TokenService` (Task 4, injected but unused until Task 10), `Customer`/`CustomerIdentity` entities (Task 8).
- Produces: `CustomersAuthService.register(dto): Promise<{ customerId: string }>`, `CustomersAuthService.verifyEmail(dto): Promise<void>` — consumed by the login/refresh/logout task (Task 10) via the same service class, and by the OAuth task (Task 11) for the "find-or-create customer" step. The 4-arg constructor `(tenantDb, hashing, notifications, tokenService)` is fixed from this task onward — later tasks add methods, not constructor params.

- [ ] **Step 1: Write DTOs**

```ts
// apps/api/src/customers/dto/register-customer.dto.ts
import { IsEmail, MinLength } from 'class-validator';

export class RegisterCustomerDto {
  @IsEmail()
  email!: string;

  @MinLength(12)
  password!: string;

  name!: string;
}
```

```ts
// apps/api/src/customers/dto/verify-customer-email.dto.ts
import { IsString } from 'class-validator';

export class VerifyCustomerEmailDto {
  @IsString()
  token!: string;
}
```

- [ ] **Step 2: Write the failing test**

```ts
// apps/api/src/customers/__tests__/customers-auth.service.spec.ts
import { ConflictException } from '@nestjs/common';
import { CustomersAuthService } from '../customers-auth.service';
import { TokenService } from '../../auth-core/token.service';

// NOTE: CustomersAuthService's constructor gains a fourth TokenService
// parameter in Task 10 (login/refresh/logout need it to sign access
// tokens). This helper takes a stub for it now so this file doesn't need
// editing again when Task 10 lands — Task 10 adds its own describe blocks
// using this same helper, passing a real TokenService where it matters.
function buildService() {
  const manager = {
    findOne: jest.fn(),
    create: jest.fn((_entity: any, data: any) => data),
    save: jest.fn((entity: any) => Promise.resolve({ id: 'generated-id', ...entity })),
  };
  const tenantDb = { run: jest.fn((work: any) => work(manager)) } as any;
  const hashing = { hash: jest.fn().mockResolvedValue('hashed-password'), verify: jest.fn() } as any;
  const notifications = { sendEmail: jest.fn().mockResolvedValue(undefined) } as any;
  const tokenService = new TokenService({ sign: jest.fn().mockReturnValue('signed-jwt') } as any);
  const service = new CustomersAuthService(tenantDb, hashing, notifications, tokenService);
  return { service, manager, hashing, notifications, tokenService };
}

describe('CustomersAuthService.register', () => {
  it('creates a customer and a password identity, then sends a verification email', async () => {
    const { service, manager, hashing, notifications } = buildService();
    manager.findOne.mockResolvedValue(null);

    const result = await service.register({
      email: 'jane@example.com',
      password: 'correct horse battery staple',
      name: 'Jane',
    });

    expect(hashing.hash).toHaveBeenCalledWith('correct horse battery staple');
    expect(manager.save).toHaveBeenCalledTimes(2); // Customer, then CustomerIdentity
    expect(notifications.sendEmail).toHaveBeenCalledWith(
      'jane@example.com',
      'verification-email',
      expect.objectContaining({ token: expect.any(String) }),
    );
    expect(result).toEqual({ customerId: 'generated-id' });
  });

  it('rejects registration when the email already exists for this tenant', async () => {
    const { service, manager } = buildService();
    manager.findOne.mockResolvedValue({ id: 'existing-customer' });

    await expect(
      service.register({ email: 'jane@example.com', password: 'correct horse battery staple', name: 'Jane' }),
    ).rejects.toThrow(ConflictException);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/api test -- customers-auth.service -v`
Expected: FAIL — `Cannot find module '../customers-auth.service'`

- [ ] **Step 4: Write the service implementation**

```ts
// apps/api/src/customers/customers-auth.service.ts
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { Customer, CustomerIdentity } from '../db/entities';
import { TenantDbService } from '../db/tenant-db.service';
import { HashingService } from '../auth-core/hashing.service';
import { NOTIFICATIONS_PORT, NotificationsPort } from '../auth-core/notifications/notifications-port';
import { TokenService } from '../auth-core/token.service';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import { VerifyCustomerEmailDto } from './dto/verify-customer-email.dto';

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// TokenService isn't used by register()/verifyEmail() yet — it's accepted
// here (rather than added later) because Task 10 adds login/refresh/logout
// to this same class and needs it, and TokenService already exists from
// Task 4. Taking it in the constructor now avoids a breaking signature
// change to this file in a later task.
@Injectable()
export class CustomersAuthService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly hashing: HashingService,
    @Inject(NOTIFICATIONS_PORT) private readonly notifications: NotificationsPort,
    private readonly tokenService: TokenService,
  ) {}

  async register(dto: RegisterCustomerDto): Promise<{ customerId: string }> {
    return this.tenantDb.run(async (manager) => {
      const existing = await manager.findOne(Customer, { where: { email: dto.email } });
      if (existing) {
        throw new ConflictException('Email already registered');
      }

      // Must go through manager.create() + save(), not save(Entity, plainLiteral) —
      // @BeforeInsert() id generation is a prototype method and is skipped
      // for plain objects (see base/immutable-tenant-entity-base.ts).
      const customer = await manager.save(manager.create(Customer, { email: dto.email, name: dto.name }));

      const passwordHash = await this.hashing.hash(dto.password);
      const verificationToken = randomBytes(32).toString('base64url');
      const verificationTokenHash = createHash('sha256').update(verificationToken).digest('hex');

      await manager.save(
        manager.create(CustomerIdentity, {
          customerId: customer.id,
          provider: 'password',
          providerSubject: null,
          passwordHash,
          emailVerified: false,
          verificationTokenHash,
          verificationTokenExpiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
        }),
      );

      await this.notifications.sendEmail(dto.email, 'verification-email', {
        token: verificationToken,
      });

      return { customerId: customer.id };
    });
  }

  async verifyEmail(dto: VerifyCustomerEmailDto): Promise<void> {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');

    await this.tenantDb.run(async (manager) => {
      const identity = await manager.findOne(CustomerIdentity, {
        where: { provider: 'password', verificationTokenHash: tokenHash },
      });

      if (!identity || !identity.verificationTokenExpiresAt || identity.verificationTokenExpiresAt < new Date()) {
        throw new NotFoundException('Invalid or expired verification token');
      }

      identity.emailVerified = true;
      identity.verificationTokenHash = null;
      identity.verificationTokenExpiresAt = null;
      await manager.save(CustomerIdentity, identity);
    });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/api test -- customers-auth.service -v`
Expected: PASS (2 tests)

- [ ] **Step 6: Write the controller**

```ts
// apps/api/src/customers/customers-auth.controller.ts
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CustomersAuthService } from './customers-auth.service';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import { VerifyCustomerEmailDto } from './dto/verify-customer-email.dto';

@Controller('customers/auth')
export class CustomersAuthController {
  constructor(private readonly customersAuthService: CustomersAuthService) {}

  @Post('register')
  register(@Body() dto: RegisterCustomerDto) {
    return this.customersAuthService.register(dto);
  }

  @Post('verify-email')
  @HttpCode(200)
  verifyEmail(@Body() dto: VerifyCustomerEmailDto) {
    return this.customersAuthService.verifyEmail(dto);
  }
}
```

- [ ] **Step 7: Write the module**

```ts
// apps/api/src/customers/customers-auth.module.ts
import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../auth-core/auth-core.module';
import { CustomersAuthController } from './customers-auth.controller';
import { CustomersAuthService } from './customers-auth.service';

@Module({
  imports: [AuthCoreModule],
  controllers: [CustomersAuthController],
  providers: [CustomersAuthService],
  exports: [CustomersAuthService],
})
export class CustomersAuthModule {}
```

- [ ] **Step 8: Import into AppModule**

```ts
// apps/api/src/app/app.module.ts
import { CustomersAuthModule } from '../customers/customers-auth.module';

@Module({
  imports: [DatabaseModule, CustomersAuthModule],
  // ...
})
```

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/customers apps/api/src/app/app.module.ts
git commit -m "feat(customers): add registration and email verification"
```

---

## Task 10: Customers — login, refresh, logout

**Files:**
- Modify: `apps/api/package.json` (add `passport`, `passport-local`, `passport-jwt`, `@nestjs/passport`, `@types/passport-local`, `@types/passport-jwt`)
- Create: `apps/api/src/customers/dto/login-customer.dto.ts`
- Modify: `apps/api/src/customers/customers-auth.service.ts` (add `login`, `refresh`, `logout`)
- Create: `apps/api/src/customers/customer-local.strategy.ts`
- Create: `apps/api/src/customers/customer-jwt.strategy.ts`
- Create: `apps/api/src/customers/customer-jwt-auth.guard.ts`
- Modify: `apps/api/src/customers/customers-auth.controller.ts`
- Modify: `apps/api/src/customers/customers-auth.module.ts`
- Modify: `apps/api/src/customers/__tests__/customers-auth.service.spec.ts` (add cases)

**Interfaces:**
- Consumes: `TokenService.signAccessToken`/`verifyAccessToken`, `generateOpaqueRefreshToken`/`hashRefreshToken` (Tasks 4, 5), `CustomerRefreshToken` entity (Task 8).
- Produces: `CustomersAuthService.login(email, password): Promise<{ accessToken: string; refreshToken: string }>`, `.refresh(rawRefreshToken: string): Promise<{ accessToken: string; refreshToken: string }>`, `.logout(rawRefreshToken: string): Promise<void>` — the refresh/access token pair shape is what Task 11's OAuth callback and the controller's cookie-setting logic depend on.

- [ ] **Step 1: Install Passport packages**

Run: `pnpm --filter @tiny-threads/api add @nestjs/passport passport passport-local passport-jwt`
Run: `pnpm --filter @tiny-threads/api add -D @types/passport-local @types/passport-jwt`

- [ ] **Step 2: Write DTO**

```ts
// apps/api/src/customers/dto/login-customer.dto.ts
import { IsEmail, IsString } from 'class-validator';

export class LoginCustomerDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}
```

- [ ] **Step 3: Write the failing tests for login/refresh/logout**

Add to `apps/api/src/customers/__tests__/customers-auth.service.spec.ts`:

```ts
import { UnauthorizedException } from '@nestjs/common';
import { TokenService } from '../../auth-core/token.service';

describe('CustomersAuthService.login/refresh/logout', () => {
  function buildFullService() {
    const identity = {
      customerId: 'cust-1',
      passwordHash: 'hashed-password',
      emailVerified: true,
    };
    const manager = {
      findOne: jest.fn().mockImplementation((entity: any, opts: any) => {
        if (opts.where.provider === 'password') return Promise.resolve(identity);
        return Promise.resolve(null);
      }),
      create: jest.fn((_entity: any, data: any) => data),
      save: jest.fn((data: any) => Promise.resolve({ id: 'rt-1', ...data })),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const tenantDb = { run: jest.fn((work: any) => work(manager)) } as any;
    const hashing = { hash: jest.fn(), verify: jest.fn().mockResolvedValue(true) } as any;
    const notifications = { sendEmail: jest.fn() } as any;
    const tokenService = new TokenService({ sign: jest.fn().mockReturnValue('signed-jwt') } as any);
    const service = new (require('../customers-auth.service').CustomersAuthService)(
      tenantDb,
      hashing,
      notifications,
      tokenService,
    );
    return { service, manager, hashing, tokenService };
  }

  it('logs in with a correct password and returns an access+refresh token pair', async () => {
    const { service, hashing } = buildFullService();
    const result = await service.login('tenant-1', 'jane@example.com', 'correct password');

    expect(hashing.verify).toHaveBeenCalledWith('hashed-password', 'correct password');
    expect(result.accessToken).toEqual('signed-jwt');
    expect(typeof result.refreshToken).toBe('string');
  });

  it('rejects login with an incorrect password', async () => {
    const { service, hashing } = buildFullService();
    hashing.verify.mockResolvedValue(false);

    await expect(service.login('tenant-1', 'jane@example.com', 'wrong')).rejects.toThrow(UnauthorizedException);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `pnpm --filter @tiny-threads/api test -- customers-auth.service -v`
Expected: FAIL — `service.login is not a function`

- [ ] **Step 5: Extend the service with login/refresh/logout**

Add to `apps/api/src/customers/customers-auth.service.ts` (the constructor already takes `TokenService` from Task 9 — these methods are what actually use it):

```ts
import { randomUUID } from 'node:crypto';
import { CustomerRefreshToken } from '../db/entities';
import { generateOpaqueRefreshToken, hashRefreshToken } from '../auth-core/refresh-token-crypto';
import { UnauthorizedException } from '@nestjs/common';

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

async login(
  tenantId: string,
  email: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  return this.tenantDb.run(async (manager) => {
    const customer = await manager.findOne(Customer, { where: { email } });
    const identity = customer
      ? await manager.findOne(CustomerIdentity, {
          where: { customerId: customer.id, provider: 'password' },
        })
      : null;

    if (!customer || !identity?.passwordHash || !(await this.hashing.verify(identity.passwordHash, password))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.issueTokenPair(manager, tenantId, customer.id, randomUUID());
  });
}

async refresh(
  tenantId: string,
  rawRefreshToken: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const tokenHash = hashRefreshToken(rawRefreshToken);

  return this.tenantDb.run(async (manager) => {
    const existing = await manager.findOne(CustomerRefreshToken, { where: { tokenHash } });
    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (existing.revokedAt) {
      // Reuse of a revoked token in this family is a theft signal: revoke the whole family.
      await manager.update(CustomerRefreshToken, { familyId: existing.familyId }, { revokedAt: new Date() });
      throw new UnauthorizedException('Refresh token reuse detected');
    }
    if (existing.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    await manager.update(CustomerRefreshToken, { id: existing.id }, { revokedAt: new Date() });
    return this.issueTokenPair(manager, tenantId, existing.customerId, existing.familyId);
  });
}

async logout(tenantId: string, rawRefreshToken: string): Promise<void> {
  const tokenHash = hashRefreshToken(rawRefreshToken);
  await this.tenantDb.run(async (manager) => {
    const existing = await manager.findOne(CustomerRefreshToken, { where: { tokenHash } });
    if (existing && !existing.revokedAt) {
      await manager.update(CustomerRefreshToken, { familyId: existing.familyId }, { revokedAt: new Date() });
    }
  });
}

private async issueTokenPair(
  manager: import('typeorm').EntityManager,
  tenantId: string,
  customerId: string,
  familyId: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const rawRefreshToken = generateOpaqueRefreshToken();

  await manager.save(
    manager.create(CustomerRefreshToken, {
      customerId,
      tokenHash: hashRefreshToken(rawRefreshToken),
      familyId,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      revokedAt: null,
    }),
  );

  const accessToken = this.tokenService.signAccessToken({ sub: customerId, aud: 'customer', tenantId });
  return { accessToken, refreshToken: rawRefreshToken };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @tiny-threads/api test -- customers-auth.service -v`
Expected: PASS (4 tests)

- [ ] **Step 7: Write the local and JWT Passport strategies**

```ts
// apps/api/src/customers/customer-local.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { ClsService } from 'nestjs-cls';
import { CustomersAuthService } from './customers-auth.service';

@Injectable()
export class CustomerLocalStrategy extends PassportStrategy(Strategy, 'customer-local') {
  constructor(
    private readonly customersAuthService: CustomersAuthService,
    private readonly cls: ClsService,
  ) {
    super({ usernameField: 'email' });
  }

  async validate(email: string, password: string) {
    const tenantId = this.cls.get<string>('tenantId');
    return this.customersAuthService.login(tenantId, email, password);
  }
}
```

```ts
// apps/api/src/customers/customer-jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AccessTokenPayload } from '../auth-core/token.service';

@Injectable()
export class CustomerJwtStrategy extends PassportStrategy(Strategy, 'customer-jwt') {
  constructor() {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET is not set');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: secret,
    });
  }

  validate(payload: AccessTokenPayload): AccessTokenPayload {
    if (payload.aud !== 'customer') {
      throw new UnauthorizedException('Wrong token audience');
    }
    return payload;
  }
}
```

```ts
// apps/api/src/customers/customer-jwt-auth.guard.ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class CustomerJwtAuthGuard extends AuthGuard('customer-jwt') {}
```

- [ ] **Step 8: Wire login/refresh/logout endpoints with refresh-cookie handling**

```ts
// apps/api/src/customers/customers-auth.controller.ts
import { Body, Controller, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { CustomersAuthService } from './customers-auth.service';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import { VerifyCustomerEmailDto } from './dto/verify-customer-email.dto';

const REFRESH_COOKIE_NAME = 'customer_refresh_token';
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/customers/auth',
};

@Controller('customers/auth')
export class CustomersAuthController {
  constructor(private readonly customersAuthService: CustomersAuthService) {}

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
    const { accessToken, refreshToken } = req.user as { accessToken: string; refreshToken: string };
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);
    return { accessToken };
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body('tenantId') tenantId: string,
  ) {
    const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    const result = await this.customersAuthService.refresh(tenantId, rawRefreshToken);
    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, REFRESH_COOKIE_OPTIONS);
    return { accessToken: result.accessToken };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body('tenantId') tenantId: string,
  ) {
    const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (rawRefreshToken) {
      await this.customersAuthService.logout(tenantId, rawRefreshToken);
    }
    res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_OPTIONS.path });
    return { success: true };
  }
}
```

> Note: `refresh`/`logout` take `tenantId` from the request body here because the refresh cookie alone doesn't carry it, and `TenantResolutionMiddleware` (Task 1) already resolves tenant from the subdomain into CLS — a cleaner follow-up is to read it from CLS via `ClsService` instead of the body; either is fine for this plan, prefer CLS if you're implementing this task directly.

- [ ] **Step 9: Register strategies and guard in the module**

```ts
// apps/api/src/customers/customers-auth.module.ts
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthCoreModule } from '../auth-core/auth-core.module';
import { CustomersAuthController } from './customers-auth.controller';
import { CustomersAuthService } from './customers-auth.service';
import { CustomerLocalStrategy } from './customer-local.strategy';
import { CustomerJwtStrategy } from './customer-jwt.strategy';

@Module({
  imports: [AuthCoreModule, PassportModule],
  controllers: [CustomersAuthController],
  providers: [CustomersAuthService, CustomerLocalStrategy, CustomerJwtStrategy],
  exports: [CustomersAuthService],
})
export class CustomersAuthModule {}
```

- [ ] **Step 10: Install cookie-parser and wire it in main.ts**

Run: `pnpm --filter @tiny-threads/api add cookie-parser`
Run: `pnpm --filter @tiny-threads/api add -D @types/cookie-parser`

```ts
// apps/api/src/main.ts (add alongside the ValidationPipe from Task 7)
import cookieParser from 'cookie-parser';
// ...
app.use(cookieParser());
```

- [ ] **Step 11: Run the full customers test suite**

Run: `pnpm --filter @tiny-threads/api test -- customers -v`
Expected: PASS

- [ ] **Step 12: Commit**

```bash
git add apps/api/package.json apps/api/pnpm-lock.yaml apps/api/src/customers apps/api/src/main.ts
git commit -m "feat(customers): add password login, refresh rotation, and logout"
```

---

## Task 11: Customers — Google OAuth

**Files:**
- Modify: `apps/api/package.json` (add `passport-google-oauth20`, `@types/passport-google-oauth20`)
- Create: `apps/api/src/customers/dto/customer-oauth-initiate.dto.ts`
- Modify: `apps/api/src/customers/customers-auth.service.ts` (add `findOrCreateFromGoogle`, `linkGoogleIdentity`)
- Create: `apps/api/src/oauth/google-oauth.controller.ts` (the centralized callback, shared shape — MerchantAdmins wires into the same controller in Task 14)
- Create: `apps/api/src/oauth/oauth.module.ts`
- Modify: `apps/api/src/customers/customers-auth.controller.ts` (add `google/initiate`, `google/link`)
- Create: `apps/api/src/customers/__tests__/customers-auth.service.oauth.spec.ts`

**Interfaces:**
- Consumes: `OAuthStateService.encode`/`decode` (Task 6), `CustomerIdentity` entity (Task 8).
- Produces: `CustomersAuthService.findOrCreateFromGoogle({ tenantId, googleSub, email, emailVerified }): Promise<{ accessToken: string; refreshToken: string } | { linkRequired: true }>`, `.linkGoogleIdentity({ tenantId, customerId, googleSub, email, emailVerified }): Promise<void>` — called from the shared `GoogleOAuthController` callback (also used by Task 14's merchant-admin flow via the `population` field in decoded state).

- [ ] **Step 1: Install passport-google-oauth20**

Run: `pnpm --filter @tiny-threads/api add passport-google-oauth20`
Run: `pnpm --filter @tiny-threads/api add -D @types/passport-google-oauth20`

- [ ] **Step 2: Write the failing test for the linking rule**

```ts
// apps/api/src/customers/__tests__/customers-auth.service.oauth.spec.ts
import { CustomersAuthService } from '../customers-auth.service';
import { TokenService } from '../../auth-core/token.service';

function buildService(existingCustomer: any, existingPasswordIdentity: any) {
  const manager = {
    findOne: jest.fn().mockImplementation((entity: any, opts: any) => {
      if (opts.where.email) return Promise.resolve(existingCustomer);
      if (opts.where.provider === 'password') return Promise.resolve(existingPasswordIdentity);
      if (opts.where.provider === 'google') return Promise.resolve(null);
      return Promise.resolve(null);
    }),
    create: jest.fn((_entity: any, data: any) => data),
    save: jest.fn((data: any) => Promise.resolve({ id: 'rt-1', ...data })),
  };
  const tenantDb = { run: jest.fn((work: any) => work(manager)) } as any;
  const hashing = {} as any;
  const notifications = { sendEmail: jest.fn() } as any;
  const tokenService = new TokenService({ sign: jest.fn().mockReturnValue('signed-jwt') } as any);
  return new CustomersAuthService(tenantDb, hashing, notifications, tokenService);
}

describe('CustomersAuthService.findOrCreateFromGoogle', () => {
  it('auto-links when an existing password account matches and Google reports email_verified', async () => {
    const service = buildService({ id: 'cust-1', email: 'jane@example.com' }, { customerId: 'cust-1' });

    const result = await service.findOrCreateFromGoogle({
      tenantId: 'tenant-1',
      googleSub: 'google-sub-1',
      email: 'jane@example.com',
      emailVerified: true,
    });

    expect('accessToken' in result).toBe(true);
  });

  it('does NOT auto-link when Google reports an unverified email for a matching account', async () => {
    const service = buildService({ id: 'cust-1', email: 'jane@example.com' }, { customerId: 'cust-1' });

    const result = await service.findOrCreateFromGoogle({
      tenantId: 'tenant-1',
      googleSub: 'google-sub-1',
      email: 'jane@example.com',
      emailVerified: false,
    });

    expect(result).toEqual({ linkRequired: true });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/api test -- customers-auth.service.oauth -v`
Expected: FAIL — `service.findOrCreateFromGoogle is not a function`

- [ ] **Step 4: Implement the linking rule**

Add to `apps/api/src/customers/customers-auth.service.ts`:

```ts
interface GoogleProfile {
  tenantId: string;
  googleSub: string;
  email: string;
  emailVerified: boolean;
}

async findOrCreateFromGoogle(
  profile: GoogleProfile,
): Promise<{ accessToken: string; refreshToken: string } | { linkRequired: true }> {
  return this.tenantDb.run(async (manager) => {
    const existingGoogleIdentity = await manager.findOne(CustomerIdentity, {
      where: { provider: 'google', providerSubject: profile.googleSub },
    });
    if (existingGoogleIdentity) {
      return this.issueTokenPair(manager, profile.tenantId, existingGoogleIdentity.customerId, randomUUID());
    }

    const existingCustomer = await manager.findOne(Customer, { where: { email: profile.email } });
    if (existingCustomer) {
      const existingPasswordIdentity = await manager.findOne(CustomerIdentity, {
        where: { customerId: existingCustomer.id, provider: 'password' },
      });
      if (existingPasswordIdentity) {
        // MUST NOT auto-link an unverified OAuth email onto an existing account —
        // require an authenticated, deliberate link instead (see linkGoogleIdentity).
        if (!profile.emailVerified) {
          return { linkRequired: true };
        }
        await manager.save(
          manager.create(CustomerIdentity, {
            customerId: existingCustomer.id,
            provider: 'google',
            providerSubject: profile.googleSub,
            emailVerified: true,
          }),
        );
        return this.issueTokenPair(manager, profile.tenantId, existingCustomer.id, randomUUID());
      }
    }

    const customer =
      existingCustomer ??
      (await manager.save(manager.create(Customer, { email: profile.email, name: profile.email })));
    await manager.save(
      manager.create(CustomerIdentity, {
        customerId: customer.id,
        provider: 'google',
        providerSubject: profile.googleSub,
        emailVerified: profile.emailVerified,
      }),
    );
    return this.issueTokenPair(manager, profile.tenantId, customer.id, randomUUID());
  });
}

async linkGoogleIdentity(params: {
  tenantId: string;
  customerId: string;
  googleSub: string;
  email: string;
}): Promise<void> {
  await this.tenantDb.run(async (manager) => {
    const conflictingIdentity = await manager.findOne(CustomerIdentity, {
      where: { provider: 'google', providerSubject: params.googleSub },
    });
    if (conflictingIdentity && conflictingIdentity.customerId !== params.customerId) {
      throw new ConflictException('This Google account is already linked to a different customer');
    }
    await manager.save(
      manager.create(CustomerIdentity, {
        customerId: params.customerId,
        provider: 'google',
        providerSubject: params.googleSub,
        // The customer is already authenticated and deliberately requested the
        // link, so Google's own email_verified claim doesn't gate this path.
        emailVerified: true,
      }),
    );
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/api test -- customers-auth.service.oauth -v`
Expected: PASS (2 tests)

- [ ] **Step 6: Add the OAuth-initiate endpoint to CustomersAuthController**

```ts
// apps/api/src/customers/customers-auth.controller.ts (additions)
import { ClsService } from 'nestjs-cls';
import { OAuthStateService } from '../auth-core/oauth-state.service';

// ...constructor gains: private readonly oauthState: OAuthStateService, private readonly cls: ClsService

@Post('google/initiate')
initiateGoogle(@Body('returnUrl') returnUrl: string) {
  const tenantId = this.cls.get<string>('tenantId');
  const state = this.oauthState.encode({ population: 'customer', tenantId, returnUrl, intent: 'login' });
  return { redirectUrl: this.googleAuthorizeUrl(state) };
}

@UseGuards(CustomerJwtAuthGuard)
@Post('google/link/initiate')
initiateGoogleLink(@Req() req: Request, @Body('returnUrl') returnUrl: string) {
  const { sub: customerId, tenantId } = req.user as { sub: string; tenantId: string };
  const state = this.oauthState.encode({
    population: 'customer',
    tenantId,
    returnUrl,
    intent: 'link',
    linkCustomerId: customerId,
  });
  return { redirectUrl: this.googleAuthorizeUrl(state) };
}

private googleAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    redirect_uri: `${process.env.PLATFORM_BASE_URL}/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
```

- [ ] **Step 7: Write the centralized Google callback controller**

```ts
// apps/api/src/oauth/google-oauth.controller.ts
import { BadRequestException, Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { OAuthStateService } from '../auth-core/oauth-state.service';
import { CustomersAuthService } from '../customers/customers-auth.service';

// Single centralized callback registered once in Google Cloud Console —
// tenant subdomains/custom domains can't be registered individually with
// Google, so every population's OAuth flow routes through here and is then
// redirected back to the originating tenant domain (see step 8).
@Controller('auth/google')
export class GoogleOAuthController {
  private readonly client = new OAuth2Client(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    `${process.env.PLATFORM_BASE_URL}/auth/google/callback`,
  );

  constructor(
    private readonly oauthState: OAuthStateService,
    private readonly customersAuthService: CustomersAuthService,
  ) {}

  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') stateToken: string, @Res() res: Response) {
    const state = this.oauthState.decode(stateToken);
    const { tokens } = await this.client.getToken(code);
    if (!tokens.id_token) {
      throw new BadRequestException('Google did not return an id_token');
    }
    const ticket = await this.client.verifyIdToken({ idToken: tokens.id_token });
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
      // Hand off via a short-lived one-time code rather than a cross-domain
      // cookie — the tenant domain exchanges it for the real token pair.
      return res.redirect(
        `${state.returnUrl}?oneTimeCode=${encodeURIComponent(JSON.stringify(result))}`,
      );
    }

    // 'merchant_admin' population handled once Task 14 adds its branch here.
    throw new BadRequestException('Unsupported OAuth population');
  }
}
```

> Note: this plan hands the token pair to the frontend via a URL query param placeholder (`oneTimeCode=<json>`) to keep this task's scope to the linking/redirect logic. Replace this with a real short-lived server-side one-time code (store a random code -> token pair mapping with a 60-second TTL, exchanged via a same-tenant-domain POST) before shipping — flagged here as a follow-up, not a design decision to skip it.

- [ ] **Step 8: Install google-auth-library and wire the module**

Run: `pnpm --filter @tiny-threads/api add google-auth-library`

```ts
// apps/api/src/oauth/oauth.module.ts
import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../auth-core/auth-core.module';
import { CustomersAuthModule } from '../customers/customers-auth.module';
import { GoogleOAuthController } from './google-oauth.controller';

@Module({
  imports: [AuthCoreModule, CustomersAuthModule],
  controllers: [GoogleOAuthController],
})
export class OAuthModule {}
```

Import `OAuthModule` into `AppModule` alongside `CustomersAuthModule`.

- [ ] **Step 9: Run the full customers + oauth test suite**

Run: `pnpm --filter @tiny-threads/api test -- customers oauth -v`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add apps/api/package.json apps/api/pnpm-lock.yaml apps/api/src/customers apps/api/src/oauth apps/api/src/app/app.module.ts
git commit -m "feat(customers): add Google OAuth login and deliberate-link flow"
```

---

## Task 12: DB — merchant admin auth entities, migration, RLS

**Files:**
- Create: `apps/api/src/db/entities/merchant-user-identities.entity.ts`
- Create: `apps/api/src/db/entities/merchant-user-refresh-tokens.entity.ts`
- Modify: `apps/api/src/db/entities/index.ts`
- Create (generated): `apps/api/src/db/migrations/<timestamp>-AddMerchantUserAuthTables.ts`
- Modify: `apps/api/src/db/__tests__/entity-metadata.spec.ts`

**Interfaces:**
- Produces: `MerchantUserIdentity`, `MerchantUserRefreshToken` entities (identical shape to Task 8's customer tables, `merchant_user_id` FK instead of `customer_id`) — consumed by `MerchantAdminsAuthService` (Task 13).

This task is structurally identical to Task 8 — same steps, same RLS-adjacent-to-CREATE-TABLE discipline — against the existing `merchant_users` table instead of `customers`.

- [ ] **Step 1: Write the entity for `merchant_user_identities`**

```ts
// apps/api/src/db/entities/merchant-user-identities.entity.ts
import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { ImmutableTenantEntityBase } from './base';
import { MerchantUser } from './merchant-users.entity';

@Entity({ name: 'merchant_user_identities' })
@Index('merchant_user_identities_tenant_merchant_user_idx', ['tenantId', 'merchantUserId'])
@Unique('merchant_user_identities_tenant_provider_subject_uq', ['tenantId', 'provider', 'providerSubject'])
@Unique('merchant_user_identities_tenant_merchant_user_provider_uq', ['tenantId', 'merchantUserId', 'provider'])
export class MerchantUserIdentity extends ImmutableTenantEntityBase {
  @ManyToOne(() => MerchantUser)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'merchant_user_id', referencedColumnName: 'id' },
  ])
  merchantUser?: MerchantUser;

  @Column({ name: 'merchant_user_id', type: 'uuid' })
  merchantUserId!: string;

  @Column({ type: 'text' })
  provider!: 'password' | 'google';

  @Column({ name: 'provider_subject', type: 'text', nullable: true })
  providerSubject!: string | null;

  @Column({ name: 'password_hash', type: 'text', nullable: true })
  passwordHash!: string | null;

  @Column({ name: 'email_verified', type: 'boolean', default: false })
  emailVerified!: boolean;

  @Column({ name: 'verification_token_hash', type: 'text', nullable: true })
  verificationTokenHash!: string | null;

  @Column({ name: 'verification_token_expires_at', type: 'timestamptz', nullable: true })
  verificationTokenExpiresAt!: Date | null;

  @Column({ name: 'password_reset_token_hash', type: 'text', nullable: true })
  passwordResetTokenHash!: string | null;

  @Column({ name: 'password_reset_token_expires_at', type: 'timestamptz', nullable: true })
  passwordResetTokenExpiresAt!: Date | null;
}
```

- [ ] **Step 2: Write the entity for `merchant_user_refresh_tokens`**

```ts
// apps/api/src/db/entities/merchant-user-refresh-tokens.entity.ts
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ImmutableTenantEntityBase } from './base';
import { MerchantUser } from './merchant-users.entity';

@Entity({ name: 'merchant_user_refresh_tokens' })
@Index('merchant_user_refresh_tokens_tenant_merchant_user_idx', ['tenantId', 'merchantUserId'])
@Index('merchant_user_refresh_tokens_tenant_family_idx', ['tenantId', 'familyId'])
export class MerchantUserRefreshToken extends ImmutableTenantEntityBase {
  @ManyToOne(() => MerchantUser)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'merchant_user_id', referencedColumnName: 'id' },
  ])
  merchantUser?: MerchantUser;

  @Column({ name: 'merchant_user_id', type: 'uuid' })
  merchantUserId!: string;

  @Column({ name: 'token_hash', type: 'text' })
  tokenHash!: string;

  @Column({ name: 'family_id', type: 'uuid' })
  familyId!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;
}
```

- [ ] **Step 3: Register the new entities**

Add to `apps/api/src/db/entities/index.ts`:

```ts
export * from './merchant-user-identities.entity';
export * from './merchant-user-refresh-tokens.entity';
```

- [ ] **Step 4: Generate the migration**

Run: `pnpm db:generate AddMerchantUserAuthTables` (from `apps/api`)

- [ ] **Step 5: Hand-edit the generated migration to add RLS**

Same pattern as Task 8, Step 5 — add the `enableRls`/`disableRls` import and calls for `merchant_user_identities` and `merchant_user_refresh_tokens`, adjacent to their `CREATE TABLE`/`DROP TABLE` statements.

- [ ] **Step 6: Run the migration**

Run: `pnpm db:migrate`
Expected: applies and passes RLS verification for both new tables.

- [ ] **Step 7: Update the entity-metadata test**

Add `'merchant_user_identities'` and `'merchant_user_refresh_tokens'` to `apps/api/src/db/__tests__/entity-metadata.spec.ts`.

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm --filter @tiny-threads/api test -- entity-metadata -v`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/db/entities/merchant-user-identities.entity.ts apps/api/src/db/entities/merchant-user-refresh-tokens.entity.ts apps/api/src/db/entities/index.ts apps/api/src/db/migrations apps/api/src/db/__tests__/entity-metadata.spec.ts
git commit -m "feat(db): add merchant_user_identities and merchant_user_refresh_tokens tables with RLS"
```

---

## Task 13: MerchantAdmins — register, login, refresh, logout, RolesGuard

**Files:**
- Create: `apps/api/src/merchant-admins/dto/register-merchant-user.dto.ts`
- Create: `apps/api/src/merchant-admins/dto/login-merchant-user.dto.ts`
- Create: `apps/api/src/merchant-admins/dto/verify-merchant-user-email.dto.ts`
- Create: `apps/api/src/merchant-admins/merchant-admins-auth.service.ts`
- Create: `apps/api/src/merchant-admins/merchant-admin-local.strategy.ts`
- Create: `apps/api/src/merchant-admins/merchant-admin-jwt.strategy.ts`
- Create: `apps/api/src/merchant-admins/merchant-admin-jwt-auth.guard.ts`
- Create: `apps/api/src/merchant-admins/roles.guard.ts`
- Create: `apps/api/src/merchant-admins/roles.decorator.ts`
- Create: `apps/api/src/merchant-admins/merchant-admins-auth.controller.ts`
- Create: `apps/api/src/merchant-admins/merchant-admins-auth.module.ts`
- Create: `apps/api/src/merchant-admins/__tests__/merchant-admins-auth.service.spec.ts`
- Create: `apps/api/src/merchant-admins/__tests__/roles.guard.spec.ts`
- Modify: `apps/api/src/app/app.module.ts`

**Interfaces:**
- Mirrors Task 9 + Task 10's shape exactly (`MerchantAdminsAuthService.register/verifyEmail/login/refresh/logout`), against `MerchantUser`/`MerchantUserIdentity`/`MerchantUserRefreshToken` (Task 12) instead of the customer entities, with `aud: 'merchant_admin'` and a `role` claim from `merchant_users.role`.
- Produces: `RolesGuard` + `@Roles(...roles)` decorator reading `req.user.role` from the verified JWT payload — consumed by any future merchant-admin business-logic controller (e.g. refunds), not just auth itself.

- [ ] **Step 1: Write DTOs**

```ts
// apps/api/src/merchant-admins/dto/register-merchant-user.dto.ts
import { IsEmail, IsIn, MinLength } from 'class-validator';

export class RegisterMerchantUserDto {
  @IsEmail()
  email!: string;

  @MinLength(12)
  password!: string;

  @IsIn(['owner', 'admin', 'staff', 'viewer'])
  role!: string;
}
```

```ts
// apps/api/src/merchant-admins/dto/login-merchant-user.dto.ts
import { IsEmail, IsString } from 'class-validator';

export class LoginMerchantUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}
```

```ts
// apps/api/src/merchant-admins/dto/verify-merchant-user-email.dto.ts
import { IsString } from 'class-validator';

export class VerifyMerchantUserEmailDto {
  @IsString()
  token!: string;
}
```

- [ ] **Step 2: Write the failing test for register + login**

```ts
// apps/api/src/merchant-admins/__tests__/merchant-admins-auth.service.spec.ts
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { MerchantAdminsAuthService } from '../merchant-admins-auth.service';
import { TokenService } from '../../auth-core/token.service';

function buildService() {
  const identity = { merchantUserId: 'mu-1', passwordHash: 'hashed-password' };
  const merchantUser = { id: 'mu-1', role: 'owner' };
  const manager = {
    findOne: jest.fn().mockImplementation((entity: any, opts: any) => {
      if (opts.where.email) return Promise.resolve(merchantUser);
      if (opts.where.provider === 'password') return Promise.resolve(identity);
      return Promise.resolve(null);
    }),
    create: jest.fn((_entity: any, data: any) => data),
    save: jest.fn((data: any) => Promise.resolve({ id: 'generated-id', ...data })),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const tenantDb = { run: jest.fn((work: any) => work(manager)) } as any;
  const hashing = { hash: jest.fn().mockResolvedValue('hashed-password'), verify: jest.fn().mockResolvedValue(true) } as any;
  const notifications = { sendEmail: jest.fn().mockResolvedValue(undefined) } as any;
  const tokenService = new TokenService({ sign: jest.fn().mockReturnValue('signed-jwt') } as any);
  const service = new MerchantAdminsAuthService(tenantDb, hashing, notifications, tokenService);
  return { service, manager, hashing };
}

describe('MerchantAdminsAuthService', () => {
  it('rejects registration when the email already exists for this tenant', async () => {
    const { service } = buildService();

    await expect(
      service.register({ email: 'owner@shop.com', password: 'correct horse battery staple', role: 'owner' }),
    ).rejects.toThrow(ConflictException);
  });

  it('logs in and returns an access token carrying the role claim', async () => {
    const { service } = buildService();
    const result = await service.login('tenant-1', 'owner@shop.com', 'correct password');
    expect(result.accessToken).toEqual('signed-jwt');
  });

  it('rejects login with an incorrect password', async () => {
    const { service, hashing } = buildService();
    hashing.verify.mockResolvedValue(false);

    await expect(service.login('tenant-1', 'owner@shop.com', 'wrong')).rejects.toThrow(UnauthorizedException);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/api test -- merchant-admins-auth.service -v`
Expected: FAIL — `Cannot find module '../merchant-admins-auth.service'`

- [ ] **Step 4: Write the service** (mirrors `CustomersAuthService` from Tasks 9 + 10, against `MerchantUser`/`MerchantUserIdentity`/`MerchantUserRefreshToken`)

```ts
// apps/api/src/merchant-admins/merchant-admins-auth.service.ts
import { ConflictException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { EntityManager } from 'typeorm';
import { MerchantUser, MerchantUserIdentity, MerchantUserRefreshToken } from '../db/entities';
import { TenantDbService } from '../db/tenant-db.service';
import { HashingService } from '../auth-core/hashing.service';
import { NOTIFICATIONS_PORT, NotificationsPort } from '../auth-core/notifications/notifications-port';
import { TokenService } from '../auth-core/token.service';
import { generateOpaqueRefreshToken, hashRefreshToken } from '../auth-core/refresh-token-crypto';
import { RegisterMerchantUserDto } from './dto/register-merchant-user.dto';
import { VerifyMerchantUserEmailDto } from './dto/verify-merchant-user-email.dto';

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class MerchantAdminsAuthService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly hashing: HashingService,
    @Inject(NOTIFICATIONS_PORT) private readonly notifications: NotificationsPort,
    private readonly tokenService: TokenService,
  ) {}

  async register(dto: RegisterMerchantUserDto): Promise<{ merchantUserId: string }> {
    return this.tenantDb.run(async (manager) => {
      const existing = await manager.findOne(MerchantUser, { where: { email: dto.email } });
      if (existing) {
        throw new ConflictException('Email already registered');
      }

      const merchantUser = await manager.save(manager.create(MerchantUser, { email: dto.email, role: dto.role }));

      const passwordHash = await this.hashing.hash(dto.password);
      const verificationToken = randomBytes(32).toString('base64url');
      const verificationTokenHash = createHash('sha256').update(verificationToken).digest('hex');

      await manager.save(
        manager.create(MerchantUserIdentity, {
          merchantUserId: merchantUser.id,
          provider: 'password',
          providerSubject: null,
          passwordHash,
          emailVerified: false,
          verificationTokenHash,
          verificationTokenExpiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
        }),
      );

      await this.notifications.sendEmail(dto.email, 'verification-email', { token: verificationToken });

      return { merchantUserId: merchantUser.id };
    });
  }

  async verifyEmail(dto: VerifyMerchantUserEmailDto): Promise<void> {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');

    await this.tenantDb.run(async (manager) => {
      const identity = await manager.findOne(MerchantUserIdentity, {
        where: { provider: 'password', verificationTokenHash: tokenHash },
      });
      if (!identity || !identity.verificationTokenExpiresAt || identity.verificationTokenExpiresAt < new Date()) {
        throw new NotFoundException('Invalid or expired verification token');
      }
      identity.emailVerified = true;
      identity.verificationTokenHash = null;
      identity.verificationTokenExpiresAt = null;
      await manager.save(MerchantUserIdentity, identity);
    });
  }

  async login(
    tenantId: string,
    email: string,
    password: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    return this.tenantDb.run(async (manager) => {
      const merchantUser = await manager.findOne(MerchantUser, { where: { email } });
      const identity = merchantUser
        ? await manager.findOne(MerchantUserIdentity, {
            where: { merchantUserId: merchantUser.id, provider: 'password' },
          })
        : null;

      if (
        !merchantUser ||
        !identity?.passwordHash ||
        !(await this.hashing.verify(identity.passwordHash, password))
      ) {
        throw new UnauthorizedException('Invalid email or password');
      }

      return this.issueTokenPair(manager, tenantId, merchantUser.id, merchantUser.role, randomUUID());
    });
  }

  async refresh(
    tenantId: string,
    rawRefreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = hashRefreshToken(rawRefreshToken);

    return this.tenantDb.run(async (manager) => {
      const existing = await manager.findOne(MerchantUserRefreshToken, { where: { tokenHash } });
      if (!existing) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      if (existing.revokedAt) {
        await manager.update(
          MerchantUserRefreshToken,
          { familyId: existing.familyId },
          { revokedAt: new Date() },
        );
        throw new UnauthorizedException('Refresh token reuse detected');
      }
      if (existing.expiresAt < new Date()) {
        throw new UnauthorizedException('Refresh token expired');
      }

      const merchantUser = await manager.findOne(MerchantUser, { where: { id: existing.merchantUserId } });
      if (!merchantUser) {
        throw new UnauthorizedException('Merchant user no longer exists');
      }

      await manager.update(MerchantUserRefreshToken, { id: existing.id }, { revokedAt: new Date() });
      return this.issueTokenPair(manager, tenantId, merchantUser.id, merchantUser.role, existing.familyId);
    });
  }

  async logout(tenantId: string, rawRefreshToken: string): Promise<void> {
    const tokenHash = hashRefreshToken(rawRefreshToken);
    await this.tenantDb.run(async (manager) => {
      const existing = await manager.findOne(MerchantUserRefreshToken, { where: { tokenHash } });
      if (existing && !existing.revokedAt) {
        await manager.update(
          MerchantUserRefreshToken,
          { familyId: existing.familyId },
          { revokedAt: new Date() },
        );
      }
    });
  }

  private async issueTokenPair(
    manager: EntityManager,
    tenantId: string,
    merchantUserId: string,
    role: string,
    familyId: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const rawRefreshToken = generateOpaqueRefreshToken();

    await manager.save(
      manager.create(MerchantUserRefreshToken, {
        merchantUserId,
        tokenHash: hashRefreshToken(rawRefreshToken),
        familyId,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        revokedAt: null,
      }),
    );

    const accessToken = this.tokenService.signAccessToken({
      sub: merchantUserId,
      aud: 'merchant_admin',
      tenantId,
      role,
    });
    return { accessToken, refreshToken: rawRefreshToken };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/api test -- merchant-admins-auth.service -v`
Expected: PASS (3 tests)

- [ ] **Step 6: Write the roles decorator + guard, with a failing test first**

```ts
// apps/api/src/merchant-admins/__tests__/roles.guard.spec.ts
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../roles.guard';

function buildContext(role: string | undefined, requiredRoles: string[] | undefined) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(requiredRoles) } as unknown as Reflector;
  const guard = new RolesGuard(reflector);
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as any;
  return { guard, context };
}

describe('RolesGuard', () => {
  it('allows access when the user role is in the required list', () => {
    const { guard, context } = buildContext('owner', ['owner', 'admin']);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('denies access when the user role is not in the required list', () => {
    const { guard, context } = buildContext('viewer', ['owner', 'admin']);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows access when no roles are required', () => {
    const { guard, context } = buildContext('viewer', undefined);
    expect(guard.canActivate(context)).toBe(true);
  });
});
```

Run: `pnpm --filter @tiny-threads/api test -- roles.guard -v`
Expected: FAIL — `Cannot find module '../roles.guard'`

```ts
// apps/api/src/merchant-admins/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```

```ts
// apps/api/src/merchant-admins/roles.guard.ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest();
    if (!requiredRoles.includes(user?.role)) {
      throw new ForbiddenException('Insufficient role for this action');
    }
    return true;
  }
}
```

Run: `pnpm --filter @tiny-threads/api test -- roles.guard -v`
Expected: PASS (3 tests)

- [ ] **Step 7: Write Passport strategies and guard** (mirrors Task 10, Step 7, `aud: 'merchant_admin'`)

```ts
// apps/api/src/merchant-admins/merchant-admin-local.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { ClsService } from 'nestjs-cls';
import { MerchantAdminsAuthService } from './merchant-admins-auth.service';

@Injectable()
export class MerchantAdminLocalStrategy extends PassportStrategy(Strategy, 'merchant-admin-local') {
  constructor(
    private readonly merchantAdminsAuthService: MerchantAdminsAuthService,
    private readonly cls: ClsService,
  ) {
    super({ usernameField: 'email' });
  }

  async validate(email: string, password: string) {
    const tenantId = this.cls.get<string>('tenantId');
    return this.merchantAdminsAuthService.login(tenantId, email, password);
  }
}
```

```ts
// apps/api/src/merchant-admins/merchant-admin-jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AccessTokenPayload } from '../auth-core/token.service';

@Injectable()
export class MerchantAdminJwtStrategy extends PassportStrategy(Strategy, 'merchant-admin-jwt') {
  constructor() {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET is not set');
    }
    super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), secretOrKey: secret });
  }

  validate(payload: AccessTokenPayload): AccessTokenPayload {
    if (payload.aud !== 'merchant_admin') {
      throw new UnauthorizedException('Wrong token audience');
    }
    return payload;
  }
}
```

```ts
// apps/api/src/merchant-admins/merchant-admin-jwt-auth.guard.ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class MerchantAdminJwtAuthGuard extends AuthGuard('merchant-admin-jwt') {}
```

- [ ] **Step 8: Write the controller** (mirrors Task 9 Step 6 + Task 10 Step 8, same cookie handling under `merchant_admin_refresh_token` scoped to `/merchant-admins/auth`)

```ts
// apps/api/src/merchant-admins/merchant-admins-auth.controller.ts
import { Body, Controller, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { MerchantAdminsAuthService } from './merchant-admins-auth.service';
import { RegisterMerchantUserDto } from './dto/register-merchant-user.dto';
import { VerifyMerchantUserEmailDto } from './dto/verify-merchant-user-email.dto';

const REFRESH_COOKIE_NAME = 'merchant_admin_refresh_token';
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/merchant-admins/auth',
};

@Controller('merchant-admins/auth')
export class MerchantAdminsAuthController {
  constructor(private readonly merchantAdminsAuthService: MerchantAdminsAuthService) {}

  @Post('register')
  register(@Body() dto: RegisterMerchantUserDto) {
    return this.merchantAdminsAuthService.register(dto);
  }

  @Post('verify-email')
  @HttpCode(200)
  verifyEmail(@Body() dto: VerifyMerchantUserEmailDto) {
    return this.merchantAdminsAuthService.verifyEmail(dto);
  }

  @UseGuards(AuthGuard('merchant-admin-local'))
  @Post('login')
  login(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken } = req.user as { accessToken: string; refreshToken: string };
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);
    return { accessToken };
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body('tenantId') tenantId: string,
  ) {
    const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    const result = await this.merchantAdminsAuthService.refresh(tenantId, rawRefreshToken);
    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, REFRESH_COOKIE_OPTIONS);
    return { accessToken: result.accessToken };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body('tenantId') tenantId: string,
  ) {
    const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (rawRefreshToken) {
      await this.merchantAdminsAuthService.logout(tenantId, rawRefreshToken);
    }
    res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_OPTIONS.path });
    return { success: true };
  }
}
```

- [ ] **Step 9: Write the module and register it in AppModule**

```ts
// apps/api/src/merchant-admins/merchant-admins-auth.module.ts
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthCoreModule } from '../auth-core/auth-core.module';
import { MerchantAdminsAuthController } from './merchant-admins-auth.controller';
import { MerchantAdminsAuthService } from './merchant-admins-auth.service';
import { MerchantAdminLocalStrategy } from './merchant-admin-local.strategy';
import { MerchantAdminJwtStrategy } from './merchant-admin-jwt.strategy';

@Module({
  imports: [AuthCoreModule, PassportModule],
  controllers: [MerchantAdminsAuthController],
  providers: [MerchantAdminsAuthService, MerchantAdminLocalStrategy, MerchantAdminJwtStrategy],
  exports: [MerchantAdminsAuthService],
})
export class MerchantAdminsAuthModule {}
```

```ts
// apps/api/src/app/app.module.ts
import { MerchantAdminsAuthModule } from '../merchant-admins/merchant-admins-auth.module';

@Module({
  imports: [DatabaseModule, CustomersAuthModule, OAuthModule, MerchantAdminsAuthModule],
  // ...
})
```

- [ ] **Step 10: Run the full merchant-admins test suite**

Run: `pnpm --filter @tiny-threads/api test -- merchant-admins -v`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/merchant-admins apps/api/src/app/app.module.ts
git commit -m "feat(merchant-admins): add password auth, refresh rotation, and RolesGuard"
```

---

## Task 14: MerchantAdmins — Google OAuth

**Files:**
- Modify: `apps/api/src/merchant-admins/merchant-admins-auth.service.ts` (add `findOrCreateFromGoogle`)
- Modify: `apps/api/src/merchant-admins/merchant-admins-auth.controller.ts` (add `google/initiate`)
- Modify: `apps/api/src/oauth/google-oauth.controller.ts` (add the `merchant_admin` branch)
- Modify: `apps/api/src/oauth/oauth.module.ts` (import `MerchantAdminsAuthModule`)
- Create: `apps/api/src/merchant-admins/__tests__/merchant-admins-auth.service.oauth.spec.ts`

**Interfaces:**
- Consumes: `OAuthStateService` (Task 6), `GoogleOAuthController`'s shared callback (Task 11).
- Produces: `MerchantAdminsAuthService.findOrCreateFromGoogle({ tenantId, googleSub, email, emailVerified }): Promise<{ accessToken: string; refreshToken: string } | { linkRequired: true }>` — same shape as `CustomersAuthService.findOrCreateFromGoogle` (Task 11), so `GoogleOAuthController` can dispatch on `state.population` with a symmetric branch.

- [ ] **Step 1: Write the failing test** (mirrors Task 11, Step 2, against `MerchantUser`/`MerchantUserIdentity`)

```ts
// apps/api/src/merchant-admins/__tests__/merchant-admins-auth.service.oauth.spec.ts
import { MerchantAdminsAuthService } from '../merchant-admins-auth.service';
import { TokenService } from '../../auth-core/token.service';

function buildService(existingMerchantUser: any, existingPasswordIdentity: any) {
  const manager = {
    findOne: jest.fn().mockImplementation((entity: any, opts: any) => {
      if (opts.where.email) return Promise.resolve(existingMerchantUser);
      if (opts.where.provider === 'password') return Promise.resolve(existingPasswordIdentity);
      if (opts.where.provider === 'google') return Promise.resolve(null);
      return Promise.resolve(null);
    }),
    create: jest.fn((_entity: any, data: any) => data),
    save: jest.fn((data: any) => Promise.resolve({ id: 'rt-1', ...data })),
  };
  const tenantDb = { run: jest.fn((work: any) => work(manager)) } as any;
  const hashing = {} as any;
  const notifications = { sendEmail: jest.fn() } as any;
  const tokenService = new TokenService({ sign: jest.fn().mockReturnValue('signed-jwt') } as any);
  return new MerchantAdminsAuthService(tenantDb, hashing, notifications, tokenService);
}

describe('MerchantAdminsAuthService.findOrCreateFromGoogle', () => {
  it('auto-links when Google reports a verified email matching an existing password account', async () => {
    const service = buildService(
      { id: 'mu-1', email: 'owner@shop.com', role: 'owner' },
      { merchantUserId: 'mu-1' },
    );

    const result = await service.findOrCreateFromGoogle({
      tenantId: 'tenant-1',
      googleSub: 'google-sub-1',
      email: 'owner@shop.com',
      emailVerified: true,
    });

    expect('accessToken' in result).toBe(true);
  });

  it('does not auto-link an unverified Google email onto an existing account', async () => {
    const service = buildService(
      { id: 'mu-1', email: 'owner@shop.com', role: 'owner' },
      { merchantUserId: 'mu-1' },
    );

    const result = await service.findOrCreateFromGoogle({
      tenantId: 'tenant-1',
      googleSub: 'google-sub-1',
      email: 'owner@shop.com',
      emailVerified: false,
    });

    expect(result).toEqual({ linkRequired: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/api test -- merchant-admins-auth.service.oauth -v`
Expected: FAIL — `service.findOrCreateFromGoogle is not a function`

- [ ] **Step 3: Implement `findOrCreateFromGoogle`** (mirrors Task 11, Step 4)

Add to `apps/api/src/merchant-admins/merchant-admins-auth.service.ts`:

```ts
interface GoogleProfile {
  tenantId: string;
  googleSub: string;
  email: string;
  emailVerified: boolean;
}

async findOrCreateFromGoogle(
  profile: GoogleProfile,
): Promise<{ accessToken: string; refreshToken: string } | { linkRequired: true }> {
  return this.tenantDb.run(async (manager) => {
    const existingGoogleIdentity = await manager.findOne(MerchantUserIdentity, {
      where: { provider: 'google', providerSubject: profile.googleSub },
    });
    if (existingGoogleIdentity) {
      const owner = await manager.findOne(MerchantUser, { where: { id: existingGoogleIdentity.merchantUserId } });
      return this.issueTokenPair(manager, profile.tenantId, owner!.id, owner!.role, randomUUID());
    }

    const existingMerchantUser = await manager.findOne(MerchantUser, { where: { email: profile.email } });
    if (existingMerchantUser) {
      const existingPasswordIdentity = await manager.findOne(MerchantUserIdentity, {
        where: { merchantUserId: existingMerchantUser.id, provider: 'password' },
      });
      if (existingPasswordIdentity) {
        if (!profile.emailVerified) {
          return { linkRequired: true };
        }
        await manager.save(
          manager.create(MerchantUserIdentity, {
            merchantUserId: existingMerchantUser.id,
            provider: 'google',
            providerSubject: profile.googleSub,
            emailVerified: true,
          }),
        );
        return this.issueTokenPair(
          manager,
          profile.tenantId,
          existingMerchantUser.id,
          existingMerchantUser.role,
          randomUUID(),
        );
      }
    }

    // Unlike Customers, a merchant admin account is provisioned by an
    // existing admin (register endpoint / future invite flow), not
    // self-service via OAuth — no matching account means no access.
    throw new NotFoundException('No merchant admin account found for this email');
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/api test -- merchant-admins-auth.service.oauth -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Add the `merchant_admin` branch to the shared Google callback**

```ts
// apps/api/src/oauth/google-oauth.controller.ts (replace the final throw with a real branch)
import { MerchantAdminsAuthService } from '../merchant-admins/merchant-admins-auth.service';

// constructor gains: private readonly merchantAdminsAuthService: MerchantAdminsAuthService,

if (state.population === 'merchant_admin') {
  const result = await this.merchantAdminsAuthService.findOrCreateFromGoogle({
    tenantId: state.tenantId,
    googleSub: payload.sub,
    email: payload.email,
    emailVerified: Boolean(payload.email_verified),
  });
  if ('linkRequired' in result) {
    return res.redirect(`${state.returnUrl}?linkRequired=true`);
  }
  return res.redirect(`${state.returnUrl}?oneTimeCode=${encodeURIComponent(JSON.stringify(result))}`);
}

throw new BadRequestException('Unsupported OAuth population');
```

- [ ] **Step 6: Add the initiate endpoint to MerchantAdminsAuthController**

```ts
// apps/api/src/merchant-admins/merchant-admins-auth.controller.ts (additions)
import { ClsService } from 'nestjs-cls';
import { OAuthStateService } from '../auth-core/oauth-state.service';

// ...constructor gains: private readonly oauthState: OAuthStateService, private readonly cls: ClsService

@Post('google/initiate')
initiateGoogle(@Body('returnUrl') returnUrl: string) {
  const tenantId = this.cls.get<string>('tenantId');
  const state = this.oauthState.encode({ population: 'merchant_admin', tenantId, returnUrl, intent: 'login' });
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    redirect_uri: `${process.env.PLATFORM_BASE_URL}/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
  });
  return { redirectUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` };
}
```

- [ ] **Step 7: Wire `MerchantAdminsAuthModule` into `OAuthModule`**

```ts
// apps/api/src/oauth/oauth.module.ts
import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../auth-core/auth-core.module';
import { CustomersAuthModule } from '../customers/customers-auth.module';
import { MerchantAdminsAuthModule } from '../merchant-admins/merchant-admins-auth.module';
import { GoogleOAuthController } from './google-oauth.controller';

@Module({
  imports: [AuthCoreModule, CustomersAuthModule, MerchantAdminsAuthModule],
  controllers: [GoogleOAuthController],
})
export class OAuthModule {}
```

- [ ] **Step 8: Run the full auth test suite**

Run: `pnpm --filter @tiny-threads/api test`
Expected: PASS (all suites — auth-core, customers, merchant-admins, oauth, db)

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/merchant-admins apps/api/src/oauth
git commit -m "feat(merchant-admins): add Google OAuth login via the shared central callback"
```

---

## Task 15: Customers — password reset

**Files:**
- Create: `apps/api/src/customers/dto/request-customer-password-reset.dto.ts`
- Create: `apps/api/src/customers/dto/reset-customer-password.dto.ts`
- Modify: `apps/api/src/customers/customers-auth.service.ts` (add `requestPasswordReset`, `resetPassword`)
- Modify: `apps/api/src/customers/customers-auth.controller.ts`
- Modify: `apps/api/src/customers/__tests__/customers-auth.service.spec.ts`

**Interfaces:**
- Produces: `CustomersAuthService.requestPasswordReset(email): Promise<void>`, `.resetPassword(token, newPassword): Promise<void>` — the latter revokes every `CustomerRefreshToken` for that customer (§3's "invalidate all refresh tokens on reset").

- [ ] **Step 1: Write DTOs**

```ts
// apps/api/src/customers/dto/request-customer-password-reset.dto.ts
import { IsEmail } from 'class-validator';

export class RequestCustomerPasswordResetDto {
  @IsEmail()
  email!: string;
}
```

```ts
// apps/api/src/customers/dto/reset-customer-password.dto.ts
import { IsString, MinLength } from 'class-validator';

export class ResetCustomerPasswordDto {
  @IsString()
  token!: string;

  @MinLength(12)
  password!: string;
}
```

- [ ] **Step 2: Write the failing test**

Add to `apps/api/src/customers/__tests__/customers-auth.service.spec.ts`:

```ts
describe('CustomersAuthService.resetPassword', () => {
  it('rejects an invalid or expired reset token', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    const tenantDb = { run: jest.fn((work: any) => work(manager)) } as any;
    const hashing = { hash: jest.fn() } as any;
    const notifications = { sendEmail: jest.fn() } as any;
    const tokenService = new TokenService({ sign: jest.fn() } as any);
    const service = new CustomersAuthService(tenantDb, hashing, notifications, tokenService);

    await expect(service.resetPassword('bad-token', 'new password value')).rejects.toThrow(NotFoundException);
  });

  it('hashes the new password and revokes all refresh tokens for that customer', async () => {
    const identity = {
      customerId: 'cust-1',
      passwordResetTokenHash: 'expected-hash',
      passwordResetTokenExpiresAt: new Date(Date.now() + 60_000),
    };
    const manager = {
      findOne: jest.fn().mockResolvedValue(identity),
      save: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const tenantDb = { run: jest.fn((work: any) => work(manager)) } as any;
    const hashing = { hash: jest.fn().mockResolvedValue('new-hashed-password') } as any;
    const notifications = { sendEmail: jest.fn() } as any;
    const tokenService = new TokenService({ sign: jest.fn() } as any);
    const service = new CustomersAuthService(tenantDb, hashing, notifications, tokenService);

    await service.resetPassword('valid-token', 'new password value');

    expect(hashing.hash).toHaveBeenCalledWith('new password value');
    expect(manager.update).toHaveBeenCalledWith(
      CustomerRefreshToken,
      { customerId: 'cust-1' },
      { revokedAt: expect.any(Date) },
    );
  });
});
```

Add the needed imports at the top of the spec file: `NotFoundException` from `@nestjs/common`, `CustomerRefreshToken` from `../../db/entities`.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/api test -- customers-auth.service -v`
Expected: FAIL — `service.resetPassword is not a function`

- [ ] **Step 4: Implement `requestPasswordReset` and `resetPassword`**

Add to `apps/api/src/customers/customers-auth.service.ts`:

```ts
const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

async requestPasswordReset(email: string): Promise<void> {
  await this.tenantDb.run(async (manager) => {
    const customer = await manager.findOne(Customer, { where: { email } });
    if (!customer) {
      return; // do not reveal whether the email is registered
    }
    const identity = await manager.findOne(CustomerIdentity, {
      where: { customerId: customer.id, provider: 'password' },
    });
    if (!identity) {
      return;
    }

    const resetToken = randomBytes(32).toString('base64url');
    identity.passwordResetTokenHash = createHash('sha256').update(resetToken).digest('hex');
    identity.passwordResetTokenExpiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);
    await manager.save(CustomerIdentity, identity);

    await this.notifications.sendEmail(email, 'password-reset', { token: resetToken });
  });
}

async resetPassword(token: string, newPassword: string): Promise<void> {
  const tokenHash = createHash('sha256').update(token).digest('hex');

  await this.tenantDb.run(async (manager) => {
    const identity = await manager.findOne(CustomerIdentity, {
      where: { provider: 'password', passwordResetTokenHash: tokenHash },
    });
    if (!identity || !identity.passwordResetTokenExpiresAt || identity.passwordResetTokenExpiresAt < new Date()) {
      throw new NotFoundException('Invalid or expired password reset token');
    }

    identity.passwordHash = await this.hashing.hash(newPassword);
    identity.passwordResetTokenHash = null;
    identity.passwordResetTokenExpiresAt = null;
    await manager.save(CustomerIdentity, identity);

    // MUST invalidate all refresh tokens on reset (§3).
    await manager.update(CustomerRefreshToken, { customerId: identity.customerId }, { revokedAt: new Date() });
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/api test -- customers-auth.service -v`
Expected: PASS

- [ ] **Step 6: Add the controller endpoints**

```ts
// apps/api/src/customers/customers-auth.controller.ts (additions)
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
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/customers
git commit -m "feat(customers): add password reset with full refresh-token invalidation"
```

---

## Task 16: MerchantAdmins — password reset

**Files:**
- Create: `apps/api/src/merchant-admins/dto/request-merchant-user-password-reset.dto.ts`
- Create: `apps/api/src/merchant-admins/dto/reset-merchant-user-password.dto.ts`
- Modify: `apps/api/src/merchant-admins/merchant-admins-auth.service.ts` (add `requestPasswordReset`, `resetPassword`)
- Modify: `apps/api/src/merchant-admins/merchant-admins-auth.controller.ts`
- Modify: `apps/api/src/merchant-admins/__tests__/merchant-admins-auth.service.spec.ts`

**Interfaces:**
- Mirrors Task 15 exactly against `MerchantUser`/`MerchantUserIdentity`/`MerchantUserRefreshToken`.

- [ ] **Step 1: Write DTOs**

```ts
// apps/api/src/merchant-admins/dto/request-merchant-user-password-reset.dto.ts
import { IsEmail } from 'class-validator';

export class RequestMerchantUserPasswordResetDto {
  @IsEmail()
  email!: string;
}
```

```ts
// apps/api/src/merchant-admins/dto/reset-merchant-user-password.dto.ts
import { IsString, MinLength } from 'class-validator';

export class ResetMerchantUserPasswordDto {
  @IsString()
  token!: string;

  @MinLength(12)
  password!: string;
}
```

- [ ] **Step 2: Write the failing test**

Add to `apps/api/src/merchant-admins/__tests__/merchant-admins-auth.service.spec.ts`:

```ts
describe('MerchantAdminsAuthService.resetPassword', () => {
  it('rejects an invalid or expired reset token', async () => {
    const manager = { findOne: jest.fn().mockResolvedValue(null) };
    const tenantDb = { run: jest.fn((work: any) => work(manager)) } as any;
    const hashing = { hash: jest.fn() } as any;
    const notifications = { sendEmail: jest.fn() } as any;
    const tokenService = new TokenService({ sign: jest.fn() } as any);
    const service = new MerchantAdminsAuthService(tenantDb, hashing, notifications, tokenService);

    await expect(service.resetPassword('bad-token', 'new password value')).rejects.toThrow(NotFoundException);
  });

  it('hashes the new password and revokes all refresh tokens for that merchant user', async () => {
    const identity = {
      merchantUserId: 'mu-1',
      passwordResetTokenHash: 'expected-hash',
      passwordResetTokenExpiresAt: new Date(Date.now() + 60_000),
    };
    const manager = {
      findOne: jest.fn().mockResolvedValue(identity),
      save: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const tenantDb = { run: jest.fn((work: any) => work(manager)) } as any;
    const hashing = { hash: jest.fn().mockResolvedValue('new-hashed-password') } as any;
    const notifications = { sendEmail: jest.fn() } as any;
    const tokenService = new TokenService({ sign: jest.fn() } as any);
    const service = new MerchantAdminsAuthService(tenantDb, hashing, notifications, tokenService);

    await service.resetPassword('valid-token', 'new password value');

    expect(hashing.hash).toHaveBeenCalledWith('new password value');
    expect(manager.update).toHaveBeenCalledWith(
      MerchantUserRefreshToken,
      { merchantUserId: 'mu-1' },
      { revokedAt: expect.any(Date) },
    );
  });
});
```

Add the needed imports at the top of the spec file: `NotFoundException` from `@nestjs/common`, `MerchantUserRefreshToken` from `../../db/entities`.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/api test -- merchant-admins-auth.service -v`
Expected: FAIL — `service.resetPassword is not a function`

- [ ] **Step 4: Implement `requestPasswordReset` and `resetPassword`**

Add to `apps/api/src/merchant-admins/merchant-admins-auth.service.ts`:

```ts
const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

async requestPasswordReset(email: string): Promise<void> {
  await this.tenantDb.run(async (manager) => {
    const merchantUser = await manager.findOne(MerchantUser, { where: { email } });
    if (!merchantUser) {
      return;
    }
    const identity = await manager.findOne(MerchantUserIdentity, {
      where: { merchantUserId: merchantUser.id, provider: 'password' },
    });
    if (!identity) {
      return;
    }

    const resetToken = randomBytes(32).toString('base64url');
    identity.passwordResetTokenHash = createHash('sha256').update(resetToken).digest('hex');
    identity.passwordResetTokenExpiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);
    await manager.save(MerchantUserIdentity, identity);

    await this.notifications.sendEmail(email, 'password-reset', { token: resetToken });
  });
}

async resetPassword(token: string, newPassword: string): Promise<void> {
  const tokenHash = createHash('sha256').update(token).digest('hex');

  await this.tenantDb.run(async (manager) => {
    const identity = await manager.findOne(MerchantUserIdentity, {
      where: { provider: 'password', passwordResetTokenHash: tokenHash },
    });
    if (!identity || !identity.passwordResetTokenExpiresAt || identity.passwordResetTokenExpiresAt < new Date()) {
      throw new NotFoundException('Invalid or expired password reset token');
    }

    identity.passwordHash = await this.hashing.hash(newPassword);
    identity.passwordResetTokenHash = null;
    identity.passwordResetTokenExpiresAt = null;
    await manager.save(MerchantUserIdentity, identity);

    await manager.update(
      MerchantUserRefreshToken,
      { merchantUserId: identity.merchantUserId },
      { revokedAt: new Date() },
    );
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/api test -- merchant-admins-auth.service -v`
Expected: PASS

- [ ] **Step 6: Add the controller endpoints**

```ts
// apps/api/src/merchant-admins/merchant-admins-auth.controller.ts (additions)
@Post('request-password-reset')
@HttpCode(200)
requestPasswordReset(@Body() dto: RequestMerchantUserPasswordResetDto) {
  return this.merchantAdminsAuthService.requestPasswordReset(dto.email);
}

@Post('reset-password')
@HttpCode(200)
resetPassword(@Body() dto: ResetMerchantUserPasswordDto) {
  return this.merchantAdminsAuthService.resetPassword(dto.token, dto.password);
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/merchant-admins
git commit -m "feat(merchant-admins): add password reset with full refresh-token invalidation"
```

---

## Task 17: Concurrent-tenant RLS proof (e2e)

The design spec's §9 build order calls this out explicitly: "Prove RLS with a concurrent-tenant integration test." This runs against a real Postgres instance (via `test:e2e`), not mocks — it's the one place in this plan that actually exercises `TenantDbService`/RLS end-to-end rather than a mocked `TenantDbService.run`.

**Files:**
- Create: `apps/api/test/customer-refresh-tokens-rls.e2e-spec.ts`

**Interfaces:**
- Consumes: `TenantDbService` (existing), `ClsService`, `Customer`/`CustomerRefreshToken` entities (Task 8), the real `AppModule` (requires local Postgres up via `docker compose up -d` and a valid `.env`).

- [ ] **Step 1: Write the test**

```ts
// apps/api/test/customer-refresh-tokens-rls.e2e-spec.ts
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app/app.module';
import { TenantDbService } from '../src/db/tenant-db.service';
import { Customer, CustomerRefreshToken, Tenant } from '../src/db/entities';

describe('Customer refresh token RLS isolation (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let tenantDb: TenantDbService;
  let cls: ClsService;
  let tenantAId: string;
  let tenantBId: string;
  let customerAId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = app.get(getDataSourceToken());
    tenantDb = app.get(TenantDbService);
    cls = app.get(ClsService);

    const tenantRepo = dataSource.getRepository(Tenant);
    const tenantA = await tenantRepo.save(
      tenantRepo.create({ name: 'RLS Test Tenant A', slug: `rls-test-a-${randomUUID()}` }),
    );
    const tenantB = await tenantRepo.save(
      tenantRepo.create({ name: 'RLS Test Tenant B', slug: `rls-test-b-${randomUUID()}` }),
    );
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    customerAId = await cls.run(() => {
      cls.set('tenantId', tenantAId);
      return tenantDb.run(async (manager) => {
        const customer = await manager.save(manager.create(Customer, { email: 'a@example.com', name: 'Customer A' }));
        await manager.save(
          manager.create(CustomerRefreshToken, {
            customerId: customer.id,
            tokenHash: 'test-hash-a',
            familyId: randomUUID(),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
            revokedAt: null,
          }),
        );
        return customer.id;
      });
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('is invisible when queried under a different tenant context', async () => {
    const rows = await cls.run(() => {
      cls.set('tenantId', tenantBId);
      return tenantDb.run((manager) =>
        manager.find(CustomerRefreshToken, { where: { customerId: customerAId } }),
      );
    });

    expect(rows).toHaveLength(0);
  });

  it('is visible when queried under its own tenant context', async () => {
    const rows = await cls.run(() => {
      cls.set('tenantId', tenantAId);
      return tenantDb.run((manager) =>
        manager.find(CustomerRefreshToken, { where: { customerId: customerAId } }),
      );
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toEqual('test-hash-a');
  });
});
```

- [ ] **Step 2: Run the e2e test**

Run: `pnpm --filter @tiny-threads/api test:e2e -- customer-refresh-tokens-rls -v`
Expected: PASS (2 tests) — the first test is the actual RLS proof; if it fails (rows.length > 0), RLS is not correctly isolating `customer_refresh_tokens` and Task 8's migration must be fixed before proceeding.

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/customer-refresh-tokens-rls.e2e-spec.ts
git commit -m "test(customers): add concurrent-tenant RLS proof for customer_refresh_tokens"
```

---

## Verification checklist (run once, after Task 17)

- [ ] `pnpm --filter @tiny-threads/api test` — full unit suite passes (auth-core, customers, merchant-admins, oauth, db).
- [ ] `pnpm --filter @tiny-threads/api test:e2e` — Task 17's concurrent-tenant RLS proof passes against a real local Postgres.
- [ ] `pnpm db:migrate` from a clean DB (`docker compose down -v && docker compose up -d`) applies all migrations including the four new ones (customer + merchant-admin auth tables), and `pnpm --filter @tiny-threads/api db:verify-rls` passes for every tenant-scoped table, old and new.
- [ ] Manually exercise: register a customer → verify email → login → refresh → logout, against two different tenant subdomains.
- [ ] Manually exercise: request a password reset → reset with the emailed (logged) token → confirm the old refresh token no longer works.
- [ ] Confirm a customer JWT (`aud: "customer"`) is rejected by `MerchantAdminJwtAuthGuard` and vice versa.
- [ ] Confirm `RolesGuard` blocks a `viewer`-role merchant admin from a `@Roles('owner')`-guarded route (once such a route exists elsewhere in the codebase).
- [ ] Rate limiting on login/refresh/password-reset endpoints remains a known, flagged gap (spec §10) — not covered by this plan; do not treat its absence here as newly discovered scope creep.
