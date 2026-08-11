# Design Specification: Merchant Admin `getMe` Profile & Tenant Info + RTK `extraReducers` Consolidation

## 1. Overview & Goals

`GET /merchant-admins/auth/me` currently just echoes the caller's JWT payload (`id`, `role`, `tenantId`) with no database access. This spec:

- Expands the `getMe` response to include the merchant admin's `firstName`, `lastName`, `email`, `locale`, and the resolved `tenant` (`id`, `name`) — requiring `getMe` to become a real DB-backed lookup.
- Mirrors the richer response into the `admin-web` frontend, replacing several **hardcoded placeholder values** (`'Merchant Admin'`, `'Tiny Threads Apparels'`, `'usr_m1'`, `'tenant_demo_1'`) that exist today because the old response carried no real profile/tenant data.
- Replaces the **consecutive `dispatch()` calls** in `LoginForm.tsx` and `RequireAuth.tsx` (2–3 dispatches per component, populating two different slices from data that's partly fabricated) with RTK's `extraReducers`/`addMatcher` pattern, so slices react to RTK Query results directly instead of components manually threading data into multiple `dispatch()` calls.

### Non-goals

- **No name-capture UI.** `merchant_users` has no `firstName`/`lastName` today, and the registration flow (`RegisterMerchantUserDto`) only ever collected `token` + `password` (email/role come from the invite). This spec adds nullable columns only; a profile-edit screen or extending the invite/registration flow to collect names is future work.
- **No RLS changes.** `merchant_users` is an existing tenant-scoped table with RLS already enabled from `CreateAllTables`; this is a plain `ALTER TABLE ADD COLUMN`.

---

## 2. Backend (`apps/api`)

### 2.1 Migration

New migration `AddNameToMerchantUsers`:

```sql
ALTER TABLE merchant_users
  ADD COLUMN first_name text NULL,
  ADD COLUMN last_name text NULL;
```

No RLS helper calls needed — this is a column addition to an existing, already-RLS-enabled table, not a new table.

### 2.2 Entity

`apps/api/src/db/entities/merchant-users.entity.ts` — add:

```ts
@Column({ name: 'first_name', type: 'text', nullable: true })
firstName!: string | null;

@Column({ name: 'last_name', type: 'text', nullable: true })
lastName!: string | null;
```

(`locale` already exists on this entity.)

### 2.3 `getMe` — from JWT echo to DB lookup

Current (`apps/api/src/merchant-admins/merchant-admins-auth.controller.ts`):

```ts
@Get('me')
getMe(@Req() req: Request) {
  const user = req.user as MerchantAdminAccessTokenPayload;
  return { user: { id: user.sub, role: user.role, tenantId: user.tenantId } };
}
```

New: the controller delegates to a new `MerchantAdminsAuthService.getMe(userId: string)`, which runs one query for `MerchantUser` (via `TenantDbService.run()`) with `relations: ['tenant']`, keyed by `req.user.sub`. Response shape:

```ts
interface GetMeResponse {
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

`role` now comes from the DB row rather than the JWT claim (same value in practice, just one source of truth). No dedicated response DTO class is introduced — matches the existing convention (no `*ResponseDto` classes exist anywhere in this codebase today); the interface above lives alongside the controller/service.

### 2.4 Locale endpoint simplification

`GET /merchant-admins/me/locale` is now redundant with `getMe` and is **removed**. `PATCH /merchant-admins/me/locale` (used by `LocaleSelector` to persist a manual locale change) stays unchanged.

---

## 3. Frontend (`apps/admin-web`)

### 3.1 Type updates

`store/api/endpoints/authApi.ts` — `GetMeResponse` updated to match the new backend shape (§2.3).

`store/api/endpoints/localeApi.ts` — remove the `getLocale` query and its generated hooks (`useGetLocaleQuery`, `useLazyGetLocaleQuery`); keep `updateLocale`.

### 3.2 State consolidation

**`authSlice`** (`store/slices/authSlice.ts`):
- `AuthUser`: `{ id, email, firstName: string | null, lastName: string | null, role: string }` — drops the fabricated single `name` field.
- `AuthState.tenantId: string | null` → `AuthState.tenant: { id: string; name: string } | null`.
- Remove dead reducers/state: `status`, `error`, `loginStart`, `loginFailure`, `clearError` — confirmed via repo-wide grep that nothing outside the slice itself reads or dispatches these.
- Keep `logout` — used by `baseApi`'s 401 auto-logout and `AppLayout`'s explicit sign-out (the latter dispatches it inside a `finally` block so state clears even if the server-side logout call fails; that path can't be replaced by an `extraReducers` matcher, since a failed mutation never fulfills).
- Remove the `loginSuccess` reducer — its only two call sites (`LoginForm.tsx`, `RequireAuth.tsx`) are removed in §3.3.

**`appSlice`** (`store/slices/appSlice.ts`):
- Remove `tenantId`, `tenantName`, the `setTenant` reducer, and the `TENANT_STORAGE_KEY`/`getSavedTenant()` localStorage persistence. Tenant identity now lives solely in `authSlice`, rehydrated from the server via `getMe` on every protected-route mount — consistent with the existing move away from client-persisted session state (httpOnly cookies, no `localStorage` token).
- Keep `theme` and `locale`.

### 3.3 `extraReducers` wiring

Both slices react to the same RTK Query result via `builder.addMatcher`, instead of components dispatching into them:

- **`authSlice`**: `addMatcher(authApi.endpoints.getMe.matchFulfilled, ...)` sets `user`, `tenant`, `isAuthenticated = true`; `addMatcher(authApi.endpoints.getMe.matchRejected, ...)` clears them (`user = null`, `tenant = null`, `isAuthenticated = false`).
- **`appSlice`**: `addMatcher(authApi.endpoints.getMe.matchFulfilled, ...)` reads `user.locale`, validates it against `LOCALES`, and applies it — reusing the same validate/persist/`i18n.changeLanguage` logic the existing `setLocale` reducer has, factored into a small shared helper so it isn't duplicated between the reducer and the matcher.

This introduces a (standard, RTK-documented) circular import between `authSlice.ts`/`appSlice.ts` and `authApi.ts`. It resolves safely because neither side reads the circularly-imported binding at synchronous module-evaluation time in a blocking way — `authApi.endpoints.getMe` is fully defined by the time `createSlice()`'s `extraReducers` builder runs, given the import order (slice → api → baseApi, with `baseApi`'s reverse reference to `logout` only used lazily inside a function body).

### 3.4 Component simplification

- **`RequireAuth.tsx`**: drops the `useEffect` + two `dispatch()` calls entirely. Becomes just `useGetMeQuery()` plus the existing `isLoading`/`isAuthenticated` guard logic — the slices self-update via §3.3.
- **`LoginForm.tsx`**: drops all three dispatches (`loginSuccess`, `setTenant`, `setLocale`) and the `useLazyGetLocaleQuery`/`fetchLocale` call. Becomes:
  ```ts
  await loginMutation({ email, password }).unwrap();
  onSuccess?.();
  ```
  Real user/tenant/locale data populates once navigation lands on a `RequireAuth`-guarded route and `getMe` fires — there is no need to fetch or fabricate it inline in the login handler.
- **`AppLayout.tsx`**: reads `tenant` from `selectAuth` instead of `tenantName` from `selectApp`.
- **`DashboardPage.tsx`**: `{user?.name}` becomes a computed display string — `firstName`/`lastName` joined when either is present, falling back to `email` when both are `null` (expected today, since no name-capture flow exists yet per Non-goals).

---

## 4. Testing

- **Backend**: unit test for `MerchantAdminsAuthService.getMe` (DB lookup, tenant join); update the `GET /merchant-admins/auth/me` e2e test for the new response shape; remove/update any test covering `GET /merchant-admins/me/locale`. Backend tests live in `__tests__` directories per repo convention, not colocated.
- **Frontend**: update `authSlice.test.ts` and `appSlice.test.ts` for the new `extraReducers` behavior (replacing removed reducer tests); update `authApi.test.ts`/`localeApi.test.ts` for the type/endpoint changes; update `LoginForm`/`RequireAuth` tests to assert the simplified (no manual dispatch) behavior.

---

## 5. Summary of Removed Surface

| Removed | Reason |
|---|---|
| `GET /merchant-admins/me/locale` | Folded into `getMe` |
| `authSlice`: `status`, `error`, `loginStart`, `loginFailure`, `clearError`, `loginSuccess` | Dead or superseded by `extraReducers` |
| `authSlice.tenantId` | Replaced by `tenant: {id, name}` |
| `appSlice`: `tenantId`, `tenantName`, `setTenant`, `TENANT_STORAGE_KEY` persistence | Tenant identity now lives only in `authSlice`, rehydrated from server |
| `localeApi.getLocale` + hooks | Folded into `getMe` |
| Hardcoded placeholders (`'Merchant Admin'`, `'Tiny Threads Apparels'`, `'usr_m1'`, `'tenant_demo_1'`) in `LoginForm.tsx`/`RequireAuth.tsx` | Replaced by real data from the expanded `getMe` response |
