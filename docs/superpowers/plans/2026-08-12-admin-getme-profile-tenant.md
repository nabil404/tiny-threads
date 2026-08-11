# Admin `getMe` Profile & Tenant Info + RTK `extraReducers` Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand `GET /merchant-admins/auth/me` to return real `firstName`/`lastName`/`locale`/tenant data (currently a bare JWT echo), and replace the consecutive `dispatch()` calls that fake this data on the frontend with RTK `extraReducers` matchers that react to the RTK Query result directly.

**Architecture:** Backend: add nullable `first_name`/`last_name` columns to `merchant_users`, turn `getMe` into a real `TenantDbService` lookup joined to `Tenant`. Frontend: consolidate tenant identity into `authSlice` (removing the duplicate copy in `appSlice`), wire both slices' `extraReducers` to `authApi.endpoints.getMe.matchFulfilled`/`matchRejected`, and delete the manual `dispatch()` calls in `LoginForm`/`RequireAuth` that currently fabricate this data with hardcoded placeholders.

**Tech Stack:** NestJS 11 + TypeORM + PostgreSQL (Jest), React 19 + Redux Toolkit + RTK Query (Vitest + Testing Library).

## Global Constraints

- No name-capture UI in this plan — `merchant_users.first_name`/`last_name` are nullable columns only; no registration/invite/profile-edit flow changes. Display logic must handle both being `null`.
- No RLS changes — `merchant_users` is an existing, already-RLS-enabled table; this is a plain `ALTER TABLE ADD COLUMN`.
- No new response DTO classes for `getMe` — this codebase has none today for this endpoint; use a plain exported TypeScript interface colocated with the service, matching existing convention.
- Backend tests live in `__tests__` directories next to the code they test (existing convention), never colocated as `*.spec.ts` siblings outside `__tests__`.
- Frontend tests are already colocated in `__tests__` directories (existing convention) — keep that.
- Frontend test runner is **Vitest** (`describe`/`it`/`expect`/`vi` from `'vitest'`), not Jest — do not import Jest APIs in `apps/admin-web`.
- Tenant identity must not be persisted to `localStorage` going forward — it is rehydrated from the server via `getMe` on every protected-route mount (matches the existing httpOnly-cookie, no-localStorage-token direction of this codebase).

---

### Task 1: Add `firstName`/`lastName` to `MerchantUser` (entity + migration)

**Files:**
- Modify: `apps/api/src/db/entities/merchant-users.entity.ts`
- Create: `apps/api/src/db/migrations/1785070807147-AddNameToMerchantUsers.ts`

**Interfaces:**
- Produces: `MerchantUser.firstName: string | null`, `MerchantUser.lastName: string | null` (columns `first_name`, `last_name` on table `merchant_users`) — consumed by Task 2.

- [ ] **Step 1: Add the columns to the entity**

Edit `apps/api/src/db/entities/merchant-users.entity.ts` — current full content:

```ts
import { Entity, Column, Index, Unique, ManyToOne, JoinColumn } from 'typeorm';
import { TenantEntityBase } from './base';
import { Tenant } from './tenants.entity';

@Entity({ name: 'merchant_users' })
@Index('merchant_users_tenant_created_idx', ['tenantId', 'createdAt'])
@Unique('merchant_users_tenant_email_uq', ['tenantId', 'email'])
export class MerchantUser extends TenantEntityBase {
  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id', referencedColumnName: 'id' })
  tenant?: Tenant;

  @Column({ type: 'text' })
  email!: string;

  @Column({ type: 'text' })
  role!: string;

  @Column({ type: 'text', nullable: true })
  locale!: string | null;
}
```

Replace the whole file with:

```ts
import { Entity, Column, Index, Unique, ManyToOne, JoinColumn } from 'typeorm';
import { TenantEntityBase } from './base';
import { Tenant } from './tenants.entity';

@Entity({ name: 'merchant_users' })
@Index('merchant_users_tenant_created_idx', ['tenantId', 'createdAt'])
@Unique('merchant_users_tenant_email_uq', ['tenantId', 'email'])
export class MerchantUser extends TenantEntityBase {
  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id', referencedColumnName: 'id' })
  tenant?: Tenant;

  @Column({ type: 'text' })
  email!: string;

  @Column({ type: 'text' })
  role!: string;

  @Column({ type: 'text', nullable: true })
  locale!: string | null;

  @Column({ name: 'first_name', type: 'text', nullable: true })
  firstName!: string | null;

  @Column({ name: 'last_name', type: 'text', nullable: true })
  lastName!: string | null;
}
```

- [ ] **Step 2: Write the migration**

Create `apps/api/src/db/migrations/1785070807147-AddNameToMerchantUsers.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNameToMerchantUsers1785070807147
  implements MigrationInterface
{
  name = 'AddNameToMerchantUsers1785070807147';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "merchant_users" ADD "first_name" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "merchant_users" ADD "last_name" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "merchant_users" DROP COLUMN "last_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "merchant_users" DROP COLUMN "first_name"`,
    );
  }
}
```

- [ ] **Step 3: Ensure local Postgres is running**

Run: `docker compose up -d`
Expected: the `postgres` service is `Up` (check with `docker compose ps`).

- [ ] **Step 4: Apply the migration and verify RLS is unaffected**

Run: `pnpm --filter @tiny-threads/api db:migrate`
Expected: output shows `AddNameToMerchantUsers1785070807147` executed successfully, followed by the automatic `verify-rls` pass (no RLS regressions — this migration doesn't touch policies).

- [ ] **Step 5: Verify the columns exist**

Run: `docker compose exec postgres psql -U app_owner -d tiny_threads -c "\d merchant_users"`
Expected: output lists `first_name` and `last_name` columns with type `text`, nullable.

- [ ] **Step 6: Verify the migration reverts cleanly, then re-apply**

Run: `pnpm --filter @tiny-threads/api db:revert && pnpm --filter @tiny-threads/api db:migrate`
Expected: revert succeeds (columns dropped), then migrate succeeds again (columns re-added) — confirms `down()` is correct before leaving the DB migrated for later tasks.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/db/entities/merchant-users.entity.ts apps/api/src/db/migrations/1785070807147-AddNameToMerchantUsers.ts
git commit -m "feat(api): add nullable firstName/lastName to merchant_users"
```

---

### Task 2: `getMe` becomes a real DB-backed lookup (service + controller)

**Files:**
- Modify: `apps/api/src/merchant-admins/merchant-admins-auth.service.ts`
- Modify: `apps/api/src/merchant-admins/merchant-admins-auth.controller.ts`
- Modify: `apps/api/src/merchant-admins/__tests__/merchant-admins-auth.service.spec.ts`
- Modify: `apps/api/src/merchant-admins/__tests__/merchant-admins-auth.controller.spec.ts`

**Interfaces:**
- Consumes: `MerchantUser.firstName`/`lastName` (Task 1), `TenantDbService.run<T>(work: (manager: EntityManager) => Promise<T>): Promise<T>` (existing, `apps/api/src/db/tenant-db.service.ts`).
- Produces: `MerchantAdminsAuthService.getMe(merchantUserId: string): Promise<GetMeResult>` and the `GetMeResult` interface — consumed by the frontend's `GetMeResponse` type in Task 6 (must stay shape-identical).

- [ ] **Step 1: Write the failing service test**

Append to the end of `apps/api/src/merchant-admins/__tests__/merchant-admins-auth.service.spec.ts` (after the existing `describe('MerchantAdminsAuthService.resetPassword', ...)` block, i.e. at the end of the file):

```ts
describe('MerchantAdminsAuthService.getMe', () => {
  function buildService(merchantUser: Record<string, unknown> | null) {
    const manager = {
      findOne: jest.fn().mockResolvedValue(merchantUser),
    };
    const tenantDb = { run: jest.fn((work: any) => work(manager)) } as any;
    const hashing = { hash: jest.fn(), verify: jest.fn() } as any;
    const notifications = { sendEmail: jest.fn() } as any;
    const tokenService = new TokenService({ sign: jest.fn() } as any);
    const cls = { get: jest.fn().mockReturnValue('tenant-1') } as any;
    const service = new MerchantAdminsAuthService(
      tenantDb,
      hashing,
      notifications,
      tokenService,
      cls,
    );
    return { service, manager };
  }

  it('returns the merchant user profile joined with their tenant', async () => {
    const { service } = buildService({
      id: 'mu-1',
      email: 'owner@shop.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      role: 'owner',
      locale: 'en',
      tenant: { id: 'tenant-1', name: 'Acme Store' },
    });

    const result = await service.getMe('mu-1');

    expect(result).toEqual({
      user: {
        id: 'mu-1',
        email: 'owner@shop.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        role: 'owner',
        locale: 'en',
      },
      tenant: { id: 'tenant-1', name: 'Acme Store' },
    });
  });

  it('returns null firstName/lastName/locale when they were never captured', async () => {
    const { service } = buildService({
      id: 'mu-1',
      email: 'owner@shop.com',
      firstName: null,
      lastName: null,
      role: 'owner',
      locale: null,
      tenant: { id: 'tenant-1', name: 'Acme Store' },
    });

    const result = await service.getMe('mu-1');

    expect(result.user.firstName).toBeNull();
    expect(result.user.lastName).toBeNull();
    expect(result.user.locale).toBeNull();
  });

  it('throws when the merchant user no longer exists', async () => {
    const { service } = buildService(null);

    await expect(service.getMe('stale-user')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws when the merchant user has no resolvable tenant', async () => {
    const { service } = buildService({
      id: 'mu-1',
      email: 'owner@shop.com',
      firstName: null,
      lastName: null,
      role: 'owner',
      locale: null,
      tenant: undefined,
    });

    await expect(service.getMe('mu-1')).rejects.toThrow(UnauthorizedException);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @tiny-threads/api test -- merchant-admins-auth.service.spec.ts`
Expected: FAIL with `service.getMe is not a function`.

- [ ] **Step 3: Implement `getMe` on the service**

In `apps/api/src/merchant-admins/merchant-admins-auth.service.ts`, add this interface after the existing `GoogleProfile` interface (currently lines 40-45, right before `@Injectable()`):

```ts
export interface GetMeResult {
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
    locale: string | null;
  };
  tenant: {
    id: string;
    name: string;
  };
}
```

Then add this method to `MerchantAdminsAuthService`, immediately after the existing `logout()` method (currently ends at line 473, right before `requestPasswordReset()`):

```ts
  async getMe(merchantUserId: string): Promise<GetMeResult> {
    return this.tenantDb.run(async (manager) => {
      const merchantUser = await manager.findOne(MerchantUser, {
        where: { id: merchantUserId },
        relations: ['tenant'],
      });
      if (!merchantUser || !merchantUser.tenant) {
        throw new CodedUnauthorizedException(
          ErrorCode.MERCHANT_ADMIN_NO_LONGER_EXISTS,
          'Merchant user no longer exists',
        );
      }
      return {
        user: {
          id: merchantUser.id,
          email: merchantUser.email,
          firstName: merchantUser.firstName,
          lastName: merchantUser.lastName,
          role: merchantUser.role,
          locale: merchantUser.locale,
        },
        tenant: {
          id: merchantUser.tenant.id,
          name: merchantUser.tenant.name,
        },
      };
    });
  }
```

(`CodedUnauthorizedException` and `ErrorCode` are already imported at the top of this file.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @tiny-threads/api test -- merchant-admins-auth.service.spec.ts`
Expected: PASS, all tests in the file green.

- [ ] **Step 5: Write the failing controller test**

Append to the end of `apps/api/src/merchant-admins/__tests__/merchant-admins-auth.controller.spec.ts`. First, add these imports to the top of the file (alongside the existing ones):

```ts
import type { Request } from 'express';
import { MerchantAdminsAuthService } from '../merchant-admins-auth.service';
```

Then append at the end of the file:

```ts
describe('MerchantAdminsAuthController.getMe', () => {
  it('delegates to the service using the JWT subject', async () => {
    const service = {
      getMe: jest.fn().mockResolvedValue({
        user: {
          id: 'mu-1',
          email: 'owner@shop.com',
          firstName: 'Ada',
          lastName: 'Lovelace',
          role: 'owner',
          locale: 'en',
        },
        tenant: { id: 'tenant-1', name: 'Acme Store' },
      }),
    } as unknown as MerchantAdminsAuthService;
    const controller = new MerchantAdminsAuthController(
      service,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const req = { user: { sub: 'mu-1' } } as unknown as Request;

    const result = await controller.getMe(req);

    expect(service.getMe).toHaveBeenCalledWith('mu-1');
    expect(result).toEqual({
      user: {
        id: 'mu-1',
        email: 'owner@shop.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        role: 'owner',
        locale: 'en',
      },
      tenant: { id: 'tenant-1', name: 'Acme Store' },
    });
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm --filter @tiny-threads/api test -- merchant-admins-auth.controller.spec.ts`
Expected: FAIL — `getMe` on the real controller still returns the old synchronous JWT-echo shape (`{ user: { id, role, tenantId } }`), so the `toEqual` assertion fails.

- [ ] **Step 7: Implement the controller delegation**

In `apps/api/src/merchant-admins/merchant-admins-auth.controller.ts`, replace the current `getMe` method (lines 114-124):

```ts
  @Get('me')
  getMe(@Req() req: Request) {
    const user = req.user as MerchantAdminAccessTokenPayload;
    return {
      user: {
        id: user.sub,
        role: user.role,
        tenantId: user.tenantId,
      },
    };
  }
```

with:

```ts
  @Get('me')
  getMe(@Req() req: Request) {
    const { sub } = req.user as MerchantAdminAccessTokenPayload;
    return this.merchantAdminsAuthService.getMe(sub);
  }
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm --filter @tiny-threads/api test -- merchant-admins-auth.controller.spec.ts merchant-admins-auth.service.spec.ts`
Expected: PASS, both files green.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/merchant-admins/merchant-admins-auth.service.ts apps/api/src/merchant-admins/merchant-admins-auth.controller.ts apps/api/src/merchant-admins/__tests__/merchant-admins-auth.service.spec.ts apps/api/src/merchant-admins/__tests__/merchant-admins-auth.controller.spec.ts
git commit -m "feat(api): getMe returns firstName/lastName/locale and resolved tenant from the DB"
```

---

### Task 3: Remove the now-redundant `GET /merchant-admins/me/locale`

**Files:**
- Modify: `apps/api/src/merchant-admins/merchant-admin-locale.controller.ts`
- Modify: `apps/api/src/merchant-admins/merchant-admin-locale.service.ts`
- Modify: `apps/api/src/merchant-admins/__tests__/merchant-admin-locale.controller.spec.ts`
- Modify: `apps/api/src/merchant-admins/__tests__/merchant-admin-locale.service.spec.ts`

**Interfaces:**
- Removes: `MerchantAdminLocaleService.getLocale()`, the `GET` handler on `MerchantAdminLocaleController`. `PATCH /merchant-admins/me/locale` (`updateLocale`) is unchanged.

- [ ] **Step 1: Remove the `getLocale` service method**

In `apps/api/src/merchant-admins/merchant-admin-locale.service.ts`, remove the `getLocale` method (lines 12-17):

```ts
  async getLocale(merchantUserId: string): Promise<string | null> {
    return this.tenantDb.run(async (em) => {
      const user = await this.findUserOrThrow(em, merchantUserId);
      return user.locale;
    });
  }

```

(Delete just this block — keep `updateLocale` and `findUserOrThrow` as-is.)

- [ ] **Step 2: Remove the `GET` handler from the controller**

In `apps/api/src/merchant-admins/merchant-admin-locale.controller.ts`:

Change the import line:
```ts
import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
```
to:
```ts
import { Body, Controller, Patch, Req, UseGuards } from '@nestjs/common';
```

Remove the `getLocale` handler (lines 24-35):
```ts
  @ApiOperation({
    summary: "Get the calling merchant admin's preferred locale",
  })
  @ApiResponse({ status: 200, type: MerchantAdminLocaleResponseDto })
  @Get()
  async getLocale(
    @Req() req: Request,
  ): Promise<MerchantAdminLocaleResponseDto> {
    const { sub } = req.user as MerchantAdminAccessTokenPayload;
    const locale = await this.localeService.getLocale(sub);
    return { locale };
  }

```

- [ ] **Step 3: Update the service spec — remove the `getLocale` describe block**

In `apps/api/src/merchant-admins/__tests__/merchant-admin-locale.service.spec.ts`, remove the entire `describe('getLocale', ...)` block (lines 16-51), keeping `describe('updateLocale', ...)` untouched.

- [ ] **Step 4: Update the controller spec — remove the `getLocale` test and mock**

In `apps/api/src/merchant-admins/__tests__/merchant-admin-locale.controller.spec.ts`:

Change the mocked service setup (lines 24-27) from:
```ts
    service = {
      getLocale: jest.fn(),
      updateLocale: jest.fn(),
    } as unknown as jest.Mocked<MerchantAdminLocaleService>;
```
to:
```ts
    service = {
      updateLocale: jest.fn(),
    } as unknown as jest.Mocked<MerchantAdminLocaleService>;
```

Remove the `getLocale` test (lines 35-42):
```ts
  it('getLocale resolves the merchant user id from the JWT sub and returns the locale', async () => {
    service.getLocale.mockResolvedValue('en');

    const result = await controller.getLocale(reqWithSub('user-1'));

    expect(service.getLocale).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({ locale: 'en' });
  });

```

- [ ] **Step 5: Run both spec files to verify everything passes**

Run: `pnpm --filter @tiny-threads/api test -- merchant-admin-locale`
Expected: PASS — no reference to `getLocale` remains anywhere in either spec, and TypeScript compiles (no leftover `Get` import, no leftover mock field).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/merchant-admins/merchant-admin-locale.controller.ts apps/api/src/merchant-admins/merchant-admin-locale.service.ts apps/api/src/merchant-admins/__tests__/merchant-admin-locale.controller.spec.ts apps/api/src/merchant-admins/__tests__/merchant-admin-locale.service.spec.ts
git commit -m "refactor(api): remove GET /merchant-admins/me/locale, now folded into getMe"
```

---

### Task 4: Simplify `RequireAuth` — gate purely on the query result

**Files:**
- Modify: `apps/admin-web/src/routes/guards/RequireAuth.tsx`

**Interfaces:**
- Consumes: `useGetMeQuery()` from `@store/api/endpoints/authApi` (existing, unchanged hook signature).
- Removes: `RequireAuth`'s dependency on `authSlice`/`appSlice` entirely — it no longer dispatches `loginSuccess`/`setTenant`, and no longer reads `isAuthenticated` from Redux. `data?.user` from the query itself is the sole authority for this component's own guard decision (matches the existing sibling `PublicOnlyRoute`, which already works this way). Other consumers (`AppLayout`, `LocaleSelector`) still get `isAuthenticated`/`tenant` from `authSlice`, populated via the `extraReducers` added in Task 7 whenever this same `getMe` query resolves anywhere in the app.

Existing test coverage (`apps/admin-web/src/routes/guards/__tests__/guards.test.tsx`) already mocks `useGetMeQuery` directly and asserts on rendered output — this task requires **no test changes**, since the new `RequireAuth` reads only `data`/`isLoading`/`isError`, exactly what that test already controls. This is a deliberate improvement over the previous design: the previous version required a real dispatch to flip `authSlice.isAuthenticated`, which the existing test's mock-the-hook approach never actually exercises — it fails on the current code, but that failure is masked because `isAuthenticated` in the store happens to update in production via the (now-removed) `useEffect`.

- [ ] **Step 1: Run the existing guard tests first, to see the current baseline pass**

Run: `pnpm --filter @tiny-threads/admin-web test -- guards.test.tsx`
Expected: PASS (this confirms the starting point before the refactor).

- [ ] **Step 2: Simplify `RequireAuth.tsx`**

Replace the full content of `apps/admin-web/src/routes/guards/RequireAuth.tsx`:

```tsx
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useGetMeQuery } from '@store/api/endpoints/authApi';

export function RequireAuth() {
  const { data, isLoading, isError } = useGetMeQuery();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground text-sm">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span>Verifying session...</span>
        </div>
      </div>
    );
  }

  if (isError || !data?.user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
```

- [ ] **Step 3: Run the guard tests again to verify they still pass**

Run: `pnpm --filter @tiny-threads/admin-web test -- guards.test.tsx`
Expected: PASS, unchanged.

- [ ] **Step 4: Commit**

```bash
git add apps/admin-web/src/routes/guards/RequireAuth.tsx
git commit -m "refactor(admin-web): RequireAuth gates purely on the getMe query result"
```

---

### Task 5: Simplify `LoginForm` — drop the fabricated dispatches and locale fetch

**Files:**
- Modify: `apps/admin-web/src/features/auth/components/LoginForm.tsx`
- Modify: `apps/admin-web/src/features/auth/components/__tests__/LoginForm.test.tsx`

**Interfaces:**
- Removes: `LoginForm`'s dependency on `authSlice.loginSuccess`, `appSlice.setTenant`/`setLocale`, and `localeApi.useLazyGetLocaleQuery`. After a successful `login` mutation, it only calls `onSuccess?.()` — real user/tenant/locale data populates once navigation lands on a `RequireAuth`-guarded route and `getMe` fires (wired in Task 7/8).

- [ ] **Step 1: Update the test to stop mocking the now-unused locale hook**

In `apps/admin-web/src/features/auth/components/__tests__/LoginForm.test.tsx`:

Remove this import:
```ts
import * as localeApiHooks from '@store/api/endpoints/localeApi';
```

In the `'handles login form submission and calls onSuccess'` test, remove this block:
```ts
    const mockUnwrapLocale = vi.fn().mockResolvedValue({ locale: 'en' });
    const mockFetchLocale = vi
      .fn()
      .mockReturnValue({ unwrap: mockUnwrapLocale });
    vi.spyOn(localeApiHooks, 'useLazyGetLocaleQuery').mockReturnValue([
      mockFetchLocale as any,
      {} as any,
      {} as any,
    ]);

```

- [ ] **Step 2: Run the test to verify it still passes against the OLD component**

Run: `pnpm --filter @tiny-threads/admin-web test -- LoginForm.test.tsx`
Expected: PASS — removing an unused mock doesn't change behavior yet (the old component still calls the real `useLazyGetLocaleQuery`, which RTK Query resolves against the test's real store without a mocked `fetch`; this succeeds today because the existing tests already exercise this path without asserting on its outcome — confirm PASS before proceeding).

- [ ] **Step 3: Simplify `LoginForm.tsx`**

Replace the full content of `apps/admin-web/src/features/auth/components/LoginForm.tsx`:

```tsx
import { useState, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useLoginMutation } from '@store/api/endpoints/authApi';
import { Input } from '@components/ui/input';
import { Label } from '@components/ui/label';
import { Button } from '@components/ui/button';
import type { ErrorResponseBody } from '@tiny-threads/shared';
import { ArrowRight, Lock, User, AlertCircle } from 'lucide-react';

export interface LoginFormProps {
  initialEmail?: string;
  onSuccess?: () => void;
}

export function LoginForm({ initialEmail = '', onSuccess }: LoginFormProps) {
  const { t } = useTranslation();
  const emailId = useId();
  const passwordId = useId();

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [loginMutation, { isLoading }] = useLoginMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      await loginMutation({ email, password }).unwrap();
      onSuccess?.();
    } catch (err: unknown) {
      const customErr = err as { data?: ErrorResponseBody; message?: string };
      const errorMessage =
        customErr.data?.error?.message ??
        customErr.message ??
        t('auth.genericError');
      setError(errorMessage);
    }
  };

  return (
    <div className="w-full">
      {error && (
        <div className="mb-6 p-3.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={emailId} className="text-xs font-medium">
            {t('auth.emailLabel')}
          </Label>
          <div className="relative">
            <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id={emailId}
              type="email"
              placeholder={t('auth.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-9"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor={passwordId} className="text-xs font-medium">
              {t('auth.passwordLabel')}
            </Label>
            <span className="text-xs text-primary hover:underline cursor-pointer">
              {t('auth.forgotPassword')}
            </span>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id={passwordId}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-9"
              required
            />
          </div>
        </div>

        <Button
          type="submit"
          className="w-full mt-2 cursor-pointer"
          disabled={isLoading}
        >
          {isLoading ? (
            t('auth.authenticating')
          ) : (
            <span className="flex items-center justify-center gap-2">
              {t('auth.signIn')} <ArrowRight className="h-4 w-4" />
            </span>
          )}
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @tiny-threads/admin-web test -- LoginForm.test.tsx`
Expected: PASS — `mockLoginMutation` is still called with the right credentials and `onSuccess` still fires; the error-display test is unaffected since it never reached the removed code.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/src/features/auth/components/LoginForm.tsx apps/admin-web/src/features/auth/components/__tests__/LoginForm.test.tsx
git commit -m "refactor(admin-web): LoginForm no longer fabricates user/tenant/locale data"
```

---

### Task 6: Expand `GetMeResponse`; remove `getLocale` from `localeApi`

**Files:**
- Modify: `apps/admin-web/src/store/api/endpoints/authApi.ts`
- Modify: `apps/admin-web/src/store/api/endpoints/localeApi.ts`
- Modify: `apps/admin-web/src/store/api/endpoints/__tests__/localeApi.test.ts`

**Interfaces:**
- Produces: `GetMeResponse` matching the backend shape from Task 2 (`{ user: { id, email, firstName, lastName, role, locale }, tenant: { id, name } }`) — consumed by the `extraReducers` in Tasks 7/8.
- Removes: `localeApi.getLocale`, `useGetLocaleQuery`, `useLazyGetLocaleQuery` (nothing references these anymore after Task 5).

- [ ] **Step 1: Update `GetMeResponse`**

In `apps/admin-web/src/store/api/endpoints/authApi.ts`, replace:

```ts
export interface GetMeResponse {
  user: {
    id: string;
    role: string;
    tenantId: string;
  };
}
```

with:

```ts
export interface GetMeResponse {
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
    locale: string | null;
  };
  tenant: {
    id: string;
    name: string;
  };
}
```

- [ ] **Step 2: Remove `getLocale` from `localeApi.ts`**

Replace the full content of `apps/admin-web/src/store/api/endpoints/localeApi.ts`:

```ts
import { baseApi } from '../baseApi';

export interface LocaleResponse {
  locale: string | null;
}

export interface UpdateLocaleRequest {
  locale: string | null;
}

export const localeApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    updateLocale: builder.mutation<LocaleResponse, UpdateLocaleRequest>({
      query: (body) => ({
        url: '/merchant-admins/me/locale',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Locale'],
    }),
  }),
});

export const { useUpdateLocaleMutation } = localeApi;
```

- [ ] **Step 3: Update `localeApi.test.ts`**

Replace the full content of `apps/admin-web/src/store/api/endpoints/__tests__/localeApi.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { localeApi } from '../localeApi';

describe('localeApi endpoints', () => {
  it('injects the updateLocale mutation', () => {
    expect(localeApi.endpoints.updateLocale).toBeDefined();
    expect(typeof localeApi.endpoints.updateLocale.useMutation).toBe(
      'function',
    );
  });
});
```

- [ ] **Step 4: Run affected tests and the full type-check**

Run: `pnpm --filter @tiny-threads/admin-web test -- localeApi.test.ts authApi.test.ts`
Expected: PASS.

Run: `pnpm --filter @tiny-threads/admin-web build`
Expected: TypeScript compiles cleanly (confirms nothing else references `useGetLocaleQuery`/`useLazyGetLocaleQuery`/`GetLocaleResponse`, and nothing references the old `GetMeResponse.user.tenantId` field — both were already removed from their only call sites in Tasks 4-5).

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/src/store/api/endpoints/authApi.ts apps/admin-web/src/store/api/endpoints/localeApi.ts apps/admin-web/src/store/api/endpoints/__tests__/localeApi.test.ts
git commit -m "feat(admin-web): expand GetMeResponse; fold getLocale into getMe"
```

---

### Task 7: Consolidate `authSlice` with `extraReducers`

**Files:**
- Modify: `apps/admin-web/src/store/slices/authSlice.ts`
- Modify: `apps/admin-web/src/store/slices/__tests__/authSlice.test.ts`

**Interfaces:**
- Consumes: `authApi.endpoints.getMe.matchFulfilled`/`matchRejected` (existing RTK Query matchers, from `authApi` in `@store/api/endpoints/authApi`, shape updated in Task 6).
- Produces: `AuthState = { user: AuthUser | null; tenant: AuthTenant | null; isAuthenticated: boolean }`, `AuthUser = { id, email, firstName: string | null, lastName: string | null, role }`, `AuthTenant = { id, name }`, `logout()` action (unchanged signature) — consumed by Task 9 (`AppLayout`, `DashboardPage`) and already consumed by `baseApi.ts`'s 401 handler and `LocaleSelector`'s `isAuthenticated` check (both unchanged call sites).
- Removes: `loginStart`, `loginSuccess`, `loginFailure`, `clearError`, `status`, `error`, `tenantId` — confirmed via repo-wide grep that nothing outside this slice (and its own now-rewritten test) reads or dispatches these.

- [ ] **Step 1: Write the failing tests**

Replace the full content of `apps/admin-web/src/store/slices/__tests__/authSlice.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import authReducer, { logout, AuthState } from '../authSlice';
import { authApi } from '../../api/endpoints/authApi';
import { baseApi } from '../../api/baseApi';

function buildStore() {
  return configureStore({
    reducer: {
      auth: authReducer,
      [baseApi.reducerPath]: baseApi.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(baseApi.middleware),
  });
}

function mockFetchOnce(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

describe('authSlice', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('initializes with unauthenticated state', () => {
    const initialState: AuthState = authReducer(undefined, {
      type: 'unknown',
    });
    expect(initialState.isAuthenticated).toBe(false);
    expect(initialState.user).toBe(null);
    expect(initialState.tenant).toBe(null);
  });

  it('populates user and tenant when getMe resolves', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchOnce(200, {
        user: {
          id: 'mu-1',
          email: 'owner@shop.com',
          firstName: 'Ada',
          lastName: 'Lovelace',
          role: 'owner',
          locale: 'en',
        },
        tenant: { id: 'tenant-1', name: 'Acme Store' },
      }),
    );
    const store = buildStore();

    await store.dispatch(authApi.endpoints.getMe.initiate());

    const state = store.getState().auth;
    expect(state.isAuthenticated).toBe(true);
    expect(state.user).toEqual({
      id: 'mu-1',
      email: 'owner@shop.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      role: 'owner',
    });
    expect(state.tenant).toEqual({ id: 'tenant-1', name: 'Acme Store' });
  });

  it('clears user and tenant when getMe is rejected', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchOnce(401, { error: { message: 'Unauthorized' } }),
    );
    const store = buildStore();

    await store.dispatch(authApi.endpoints.getMe.initiate());

    const state = store.getState().auth;
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBe(null);
    expect(state.tenant).toBe(null);
  });

  it('resets state on logout', () => {
    const activeState: AuthState = {
      user: {
        id: 'mu-1',
        email: 'owner@shop.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        role: 'owner',
      },
      tenant: { id: 'tenant-1', name: 'Acme Store' },
      isAuthenticated: true,
    };

    const loggedOutState = authReducer(activeState, logout());
    expect(loggedOutState.isAuthenticated).toBe(false);
    expect(loggedOutState.user).toBe(null);
    expect(loggedOutState.tenant).toBe(null);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @tiny-threads/admin-web test -- authSlice.test.ts`
Expected: FAIL — `AuthState` has no `tenant` field yet, `getMe` fulfillment doesn't update the slice.

- [ ] **Step 3: Implement the new `authSlice.ts`**

Replace the full content of `apps/admin-web/src/store/slices/authSlice.ts`:

```ts
import { createSlice } from '@reduxjs/toolkit';
import type { RootState } from '../index';
import { authApi } from '../api/endpoints/authApi';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
}

export interface AuthTenant {
  id: string;
  name: string;
}

export interface AuthState {
  user: AuthUser | null;
  tenant: AuthTenant | null;
  isAuthenticated: boolean;
}

const initialState: AuthState = {
  user: null,
  tenant: null,
  isAuthenticated: false,
};

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout: (state) => {
      state.user = null;
      state.tenant = null;
      state.isAuthenticated = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addMatcher(authApi.endpoints.getMe.matchFulfilled, (state, action) => {
        state.user = {
          id: action.payload.user.id,
          email: action.payload.user.email,
          firstName: action.payload.user.firstName,
          lastName: action.payload.user.lastName,
          role: action.payload.user.role,
        };
        state.tenant = action.payload.tenant;
        state.isAuthenticated = true;
      })
      .addMatcher(authApi.endpoints.getMe.matchRejected, (state) => {
        state.user = null;
        state.tenant = null;
        state.isAuthenticated = false;
      });
  },
});

export const { logout } = authSlice.actions;

export const selectAuth = (state: RootState) => state.auth;

export default authSlice.reducer;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @tiny-threads/admin-web test -- authSlice.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full frontend test suite to check for fallout**

Run: `pnpm --filter @tiny-threads/admin-web test`
Expected: `appSlice.test.ts`, `AppLayout.test.tsx`, and `DashboardPage` (no test file yet) will fail or show TypeScript errors referencing the old `authSlice`/`appSlice` shapes — that's expected; they're fixed in Tasks 8-9. Confirm no *other* unrelated test regressed.

- [ ] **Step 6: Commit**

```bash
git add apps/admin-web/src/store/slices/authSlice.ts apps/admin-web/src/store/slices/__tests__/authSlice.test.ts
git commit -m "refactor(admin-web): authSlice reacts to getMe via extraReducers, adds tenant"
```

---

### Task 8: Consolidate `appSlice` — drop tenant duplication, add locale `extraReducers`

**Files:**
- Modify: `apps/admin-web/src/store/slices/appSlice.ts`
- Modify: `apps/admin-web/src/store/slices/__tests__/appSlice.test.ts`

**Interfaces:**
- Consumes: `authApi.endpoints.getMe.matchFulfilled` (Task 6/7), `LOCALES`/`LocaleId`/`LOCALE_STORAGE_KEY`/`getSavedLocale` (existing, `../../i18n/locales`).
- Produces: `AppState = { theme: ThemeId; locale: LocaleId }` (drops `tenantId`/`tenantName`), `setTheme`/`setLocale` actions (unchanged signatures) — consumed by `ThemeSelector`/`LocaleSelector` (unchanged call sites) and Task 9.
- Removes: `setTenant`, `tenantId`, `tenantName`, `TENANT_STORAGE_KEY`, `getSavedTenant` — confirmed via grep that only `LoginForm`/`RequireAuth` (already updated in Tasks 4-5) and `AppLayout` (updated in Task 9) ever referenced these.

- [ ] **Step 1: Write the failing tests**

Replace the full content of `apps/admin-web/src/store/slices/__tests__/appSlice.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import appReducer, { setTheme, setLocale, AppState } from '../appSlice';
import { authApi } from '../../api/endpoints/authApi';
import { baseApi } from '../../api/baseApi';
import { THEME_STORAGE_KEY } from '@theme/themes';
import { LOCALE_STORAGE_KEY } from '@i18n/locales';
import i18n from '@i18n';

function buildStore() {
  return configureStore({
    reducer: {
      app: appReducer,
      [baseApi.reducerPath]: baseApi.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(baseApi.middleware),
  });
}

function mockFetchOnce(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

describe('appSlice', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should initialize state with default theme from getSavedTheme()', () => {
    const initialState: AppState = appReducer(undefined, { type: 'unknown' });
    expect(initialState.theme).toBe('dark');
  });

  it('should handle setTheme and update localStorage & document attribute', () => {
    const initialState: AppState = appReducer(undefined, { type: 'unknown' });
    const nextState = appReducer(initialState, setTheme('light'));

    expect(nextState.theme).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('should initialize state with default locale from getSavedLocale()', () => {
    const initialState: AppState = appReducer(undefined, { type: 'unknown' });
    expect(initialState.locale).toBe('en');
  });

  it('should handle setLocale and update localStorage & i18next language', () => {
    const initialState: AppState = appReducer(undefined, { type: 'unknown' });
    const nextState = appReducer(initialState, setLocale('en'));

    expect(nextState.locale).toBe('en');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
    expect(i18n.language).toBe('en');
  });

  it('applies the locale returned by getMe', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchOnce(200, {
        user: {
          id: 'mu-1',
          email: 'owner@shop.com',
          firstName: null,
          lastName: null,
          role: 'owner',
          locale: 'en',
        },
        tenant: { id: 'tenant-1', name: 'Acme Store' },
      }),
    );
    const store = buildStore();

    await store.dispatch(authApi.endpoints.getMe.initiate());

    expect(store.getState().app.locale).toBe('en');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
  });

  it('ignores a null locale from getMe', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchOnce(200, {
        user: {
          id: 'mu-1',
          email: 'owner@shop.com',
          firstName: null,
          lastName: null,
          role: 'owner',
          locale: null,
        },
        tenant: { id: 'tenant-1', name: 'Acme Store' },
      }),
    );
    const store = buildStore();
    const before = store.getState().app.locale;

    await store.dispatch(authApi.endpoints.getMe.initiate());

    expect(store.getState().app.locale).toBe(before);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @tiny-threads/admin-web test -- appSlice.test.ts`
Expected: FAIL — `appSlice` doesn't react to `getMe` yet.

- [ ] **Step 3: Implement the new `appSlice.ts`**

Replace the full content of `apps/admin-web/src/store/slices/appSlice.ts`:

```ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  ThemeId,
  getSavedTheme,
  applyThemeToDocument,
  THEME_STORAGE_KEY,
} from '../../theme/themes';
import i18n from '../../i18n';
import {
  LocaleId,
  getSavedLocale,
  LOCALE_STORAGE_KEY,
  LOCALES,
} from '../../i18n/locales';
import { authApi } from '../api/endpoints/authApi';

export interface AppState {
  theme: ThemeId;
  locale: LocaleId;
}

const initialState: AppState = {
  theme: getSavedTheme(),
  locale: getSavedLocale(),
};

function applyLocale(state: AppState, locale: LocaleId) {
  state.locale = locale;
  if (typeof window !== 'undefined') {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }
  void i18n.changeLanguage(locale);
}

export const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setTheme: (state, action: PayloadAction<ThemeId>) => {
      state.theme = action.payload;
      if (typeof window !== 'undefined') {
        localStorage.setItem(THEME_STORAGE_KEY, action.payload);
      }
      applyThemeToDocument(action.payload);
    },
    setLocale: (state, action: PayloadAction<LocaleId>) => {
      applyLocale(state, action.payload);
    },
  },
  extraReducers: (builder) => {
    builder.addMatcher(
      authApi.endpoints.getMe.matchFulfilled,
      (state, action) => {
        const { locale } = action.payload.user;
        if (locale && LOCALES.some((l) => l.id === locale)) {
          applyLocale(state, locale as LocaleId);
        }
      },
    );
  },
});

export const { setTheme, setLocale } = appSlice.actions;
export const selectApp = (state: { app: AppState }) => state.app;
export default appSlice.reducer;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @tiny-threads/admin-web test -- appSlice.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/src/store/slices/appSlice.ts apps/admin-web/src/store/slices/__tests__/appSlice.test.ts
git commit -m "refactor(admin-web): appSlice drops tenant duplication, applies locale via extraReducers"
```

---

### Task 9: Update `AppLayout` and `DashboardPage` to the new state shape

**Files:**
- Modify: `apps/admin-web/src/layouts/AppLayout.tsx`
- Modify: `apps/admin-web/src/layouts/__tests__/AppLayout.test.tsx`
- Modify: `apps/admin-web/src/pages/dashboard/DashboardPage.tsx`

**Interfaces:**
- Consumes: `AuthState.tenant`, `AuthUser.firstName`/`lastName` (Task 7).

- [ ] **Step 1: Update `AppLayout.test.tsx`'s store setup to the new shape**

In `apps/admin-web/src/layouts/__tests__/AppLayout.test.tsx`, replace the `renderAppLayout` helper (lines 12-76):

```tsx
function renderAppLayout({
  tenant = { id: 'tenant-demo', name: 'Demo Store' } as {
    id: string;
    name: string;
  } | null,
  user = {
    id: 'usr_1',
    email: 'admin@demo.com',
    firstName: 'Admin',
    lastName: null,
    role: 'admin',
  } as {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
  } | null,
  initialPath = '/',
} = {}) {
  const store = configureStore({
    reducer: {
      app: appReducer,
      auth: authReducer,
      [baseApi.reducerPath]: baseApi.reducer,
    },
    preloadedState: {
      app: {
        theme: 'dark' as const,
        locale: 'en' as const,
      },
      auth: {
        user,
        tenant,
        isAuthenticated: true,
      },
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(baseApi.middleware),
  });

  const router = createMemoryRouter(
    [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <div>Dashboard Outlet Content</div> },
          { path: '/products', element: <div>Products Outlet Content</div> },
          { path: '/orders', element: <div>Orders Outlet Content</div> },
          { path: '/settings', element: <div>Settings Outlet Content</div> },
        ],
      },
    ],
    { initialEntries: [initialPath] },
  );

  return {
    store,
    ...render(
      <Provider store={store}>
        <RouterProvider router={router} />
      </Provider>,
    ),
  };
}
```

And update the "platform context" test (lines 92-98):

```tsx
  it('renders platform context badge when tenant is null', () => {
    renderAppLayout({ tenant: null });
    expect(screen.getByText(/Platform Context/i)).toBeInTheDocument();
  });
```

(The rest of the describe block — the "Demo Store" test and the logout test — is unchanged; `renderAppLayout()`'s new defaults already produce `tenant.name === 'Demo Store'` and `user.email === 'admin@demo.com'`.)

- [ ] **Step 2: Run the test to verify it fails against the old component**

Run: `pnpm --filter @tiny-threads/admin-web test -- AppLayout.test.tsx`
Expected: FAIL — `AppLayout.tsx` still reads `tenantId`/`tenantName` from `selectApp`, which no longer exist on `AppState`.

- [ ] **Step 3: Update `AppLayout.tsx`**

In `apps/admin-web/src/layouts/AppLayout.tsx`:

Remove the `selectApp` import (line 4):
```tsx
import { selectApp } from '@store/slices/appSlice';
```

Change:
```tsx
  const { tenantId, tenantName } = useAppSelector(selectApp);
  const { user } = useAppSelector(selectAuth);
```
to:
```tsx
  const { user, tenant } = useAppSelector(selectAuth);
```

Change the header brand name:
```tsx
              <span className="font-bold text-lg tracking-tight">
                {tenantName}
              </span>
```
to:
```tsx
              <span className="font-bold text-lg tracking-tight">
                {tenant?.name}
              </span>
```

Change the tenant badge:
```tsx
            <Badge
              variant={tenantId ? 'default' : 'secondary'}
              className="px-2.5 py-0.5 text-xs hidden sm:inline-flex"
            >
              {tenantId
                ? t('app.tenantBadge', { tenantId })
                : t('app.platformContext')}
            </Badge>
```
to:
```tsx
            <Badge
              variant={tenant ? 'default' : 'secondary'}
              className="px-2.5 py-0.5 text-xs hidden sm:inline-flex"
            >
              {tenant
                ? t('app.tenantBadge', { tenantId: tenant.id })
                : t('app.platformContext')}
            </Badge>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @tiny-threads/admin-web test -- AppLayout.test.tsx`
Expected: PASS.

- [ ] **Step 5: Update `DashboardPage.tsx` to display firstName/lastName**

Replace the full content of `apps/admin-web/src/pages/dashboard/DashboardPage.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '@store/hooks';
import { selectAuth } from '@store/slices/authSlice';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@components/ui/card';
import { ErrorCode } from '@tiny-threads/shared';
import { ShieldAlert, Layers, User as UserIcon } from 'lucide-react';

export function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAppSelector(selectAuth);

  const displayName =
    user && (user.firstName || user.lastName)
      ? [user.firstName, user.lastName].filter(Boolean).join(' ')
      : user?.email;

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card text-card-foreground">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <span>{t('app.authenticatedSessionTitle')}</span>
          </CardTitle>
          <CardDescription>
            {t('app.authenticatedSessionDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-muted border border-border">
              <span className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5 mb-1">
                <UserIcon className="h-3.5 w-3.5" /> {t('app.loggedInUser')}
              </span>
              <p className="text-base font-medium">
                {displayName}
                {displayName !== user?.email && ` (${user?.email})`}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('app.role', { role: user?.role })}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted border border-border">
              <span className="text-xs font-semibold uppercase text-muted-foreground">
                {t('app.sharedErrorCode')}
              </span>
              <p className="text-sm font-mono mt-1 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-500" />
                <span>{ErrorCode.AUTH_INSUFFICIENT_ROLE}</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

(No existing test file covers `DashboardPage` — none to update.)

- [ ] **Step 6: Run the full frontend suite and build**

Run: `pnpm --filter @tiny-threads/admin-web test`
Expected: PASS across all files.

Run: `pnpm --filter @tiny-threads/admin-web build`
Expected: TypeScript compiles cleanly with no leftover references to the old `AppState`/`AuthState` shapes anywhere in the app.

- [ ] **Step 7: Commit**

```bash
git add apps/admin-web/src/layouts/AppLayout.tsx apps/admin-web/src/layouts/__tests__/AppLayout.test.tsx apps/admin-web/src/pages/dashboard/DashboardPage.tsx
git commit -m "refactor(admin-web): AppLayout/DashboardPage read tenant and name from authSlice"
```

---

### Final Verification

- [ ] Run the full backend suite: `pnpm --filter @tiny-threads/api test`
- [ ] Run the full backend e2e suite: `pnpm --filter @tiny-threads/api test:e2e`
- [ ] Run the full frontend suite: `pnpm --filter @tiny-threads/admin-web test`
- [ ] Run both builds: `pnpm --filter @tiny-threads/api build && pnpm --filter @tiny-threads/admin-web build`
- [ ] Run lint across the repo: `pnpm lint`
- [ ] Manually smoke-test: log in via `admin-web`, confirm the dashboard shows the fallback display (email, since no name is captured yet), confirm the header shows the real tenant name instead of "Tiny Threads Apparels", confirm locale persists across a page reload.
