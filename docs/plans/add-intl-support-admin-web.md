# Add i18n Support to Admin Web (with Backend-Persisted Locale)

## Context

`apps/admin-web` is a greenfield frontend with no i18n at all — no library, no message catalogs, no locale switcher, and only ~14 non-test files with scattered raw English string literals. As the product grows (products, orders, store settings per the app's roadmap), retrofitting i18n later gets more expensive with every new component, so this is the right time to introduce it.

Decisions made with the user during planning:
- **Library**: `react-i18next`/`i18next` (not `react-intl`).
- **Locales at launch**: English only, but structured so a second locale is just a new catalog file.
- **Persistence**: hybrid — mirror the existing `theme` pattern (Redux + localStorage) for instant responsiveness, **and** persist to a new backend endpoint so preference could later follow the user across devices.
- Because persisting to the backend requires real authentication, and `LoginForm.tsx` is currently **fully mocked** (no real HTTP calls anywhere in the app), this plan also does the minimum real-auth wiring: a real call to `POST merchant-admins/auth/login` to obtain a genuine JWT. It deliberately does **not** build a full `/me` profile endpoint, cross-reload token persistence, or toast notifications — those are called out as explicit non-goals/follow-ups.
- Investigation also surfaced that `apps/api` has **no CORS configuration at all** — a hard blocker for any browser `fetch` from admin-web to the API. This plan adds a minimal CORS setup as a prerequisite.

### Implementation-time findings (discovered after plan approval)

- `apps/admin-web/vite.config.ts` hardcodes the dev server to **port 3000**, which collides with `apps/api`'s own default port (also 3000, from `PLATFORM_BASE_URL=http://localhost:3000` / `PORT ?? 3000` in `main.ts`). Both cannot bind 3000 simultaneously. This is a pre-existing gap, not introduced by this change — fixing the general local dev workflow (e.g. moving one app to a different default port) is out of scope here. For CORS, the origin fallback used is `http://localhost:3000` (matching Vite's actual configured port) rather than Vite's own default of 5173. Running both apps locally at once requires overriding one via env (e.g. `PORT=3001 pnpm dev:api`) until this is addressed separately.
- No seed script or fixture exists anywhere in the repo for creating a tenant + merchant admin user for local testing. End-to-end browser/curl verification of this feature required manually inserting a test tenant + merchant user row (with an Argon2 password hash) directly via SQL. This is a gap in the repo's dev onboarding, also out of scope to fix generally as part of this task.

---

## Part A — Backend (`apps/api`)

### A1. Migration: add `locale` to `merchant_users`

Add a nullable `text` column (no DB enum/CHECK — validation stays at the DTO layer, matching how `role` is already handled on this same entity). No RLS helper calls needed (`merchant_users` RLS was enabled in `InitialMigration`, not being created/dropped here).

- Add the column to the entity first (A2), then run `pnpm db:generate AddLocaleToMerchantUsers` from `apps/api` per repo convention (migrations are diffed from entity metadata, not hand-authored). Verify the generated file's timestamp sorts after the current latest (`1785360000000-AddSoftDeleteToCategories.ts`) and matches the shape of that file (plain `ALTER TABLE ... ADD` in `up()`, `DROP COLUMN` in `down()`).

### A2. Entity change

`apps/api/src/db/entities/merchant-users.entity.ts` — add:
```ts
@Column({ type: 'text', nullable: true })
locale!: string | null;
```

### A3. Supported locales constant — new shared package export

Add `packages/shared/src/locale.ts`:
```ts
export const SUPPORTED_LOCALES = ['en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
```
Export it from `packages/shared/src/index.ts` (`export * from './locale';`). This is imported by both the backend DTO's `@IsIn` and the frontend's locale config, so adding `'es'` later is a one-line change in one place.

### A4. DTOs

New file `apps/api/src/merchant-admins/dto/merchant-admin-locale.dto.ts` — `UpdateMerchantAdminLocaleDto` (`locale: string | null`, required key, `@ValidateIf`+`@IsIn(SUPPORTED_LOCALES)` when non-null) and `MerchantAdminLocaleResponseDto`. No new `ErrorCode` needed — `IS_IN` and `MERCHANT_ADMIN_NO_LONGER_EXISTS` already exist in `packages/shared/src/errors/error-codes.ts`.

### A5. Service + Controller — new sibling module

Locale self-service is a distinct concern from session/credential management, so it gets its own small module (`merchant-admin-locale.module.ts`) rather than growing `MerchantAdminsAuthService`. `MerchantAdminJwtAuthGuard` is a stateless Passport `AuthGuard` mixin, so this new module only needs `DatabaseModule`.

- `MerchantAdminLocaleService` (`apps/api/src/merchant-admins/merchant-admin-locale.service.ts`) — `getLocale`/`updateLocale`, pattern copied from `TenantSettingsService`, using `TenantDbService.run(...)`, throwing `CodedUnauthorizedException(ErrorCode.MERCHANT_ADMIN_NO_LONGER_EXISTS, ...)` if the JWT `sub` no longer resolves to a row.
- `MerchantAdminLocaleController` (`apps/api/src/merchant-admins/merchant-admin-locale.controller.ts`) — `GET`/`PATCH` at `merchant-admins/me/locale`, guarded by `MerchantAdminJwtAuthGuard` only (no `@Roles` — self-service on the caller's own `sub`). Resolves to `GET/PATCH /api/v1/merchant-admins/me/locale`.
- `MerchantAdminLocaleModule` — registered in the root app module.

### A6. Enable CORS (blocking prerequisite)

`apps/api` currently has no `app.enableCors(...)` call anywhere. Add one in `apps/api/src/bootstrap.ts`'s `configureApp()`, scoped to the admin-web dev origin, with credentials enabled (required for the httpOnly refresh cookie and for `Authorization` headers to be readable cross-origin), reading from an `ADMIN_WEB_ORIGIN` env var with a fallback matching Vite's actual configured port (`http://localhost:3000` — see the port-collision note above).

### A7. Backend verification

- Unit tests: `apps/api/src/merchant-admins/__tests__/merchant-admin-locale.service.spec.ts`, TDD (mock `TenantDbService.run`, cover: no-preference-set returns `null`, stores/returns a valid locale, stores/returns `null` reset, throws `CodedUnauthorizedException` when user not found).
- `pnpm db:generate AddLocaleToMerchantUsers` → review diff → `pnpm db:migrate` → `pnpm --filter @tiny-threads/api test`.
- Manual curl round-trip using a real JWT from the login endpoint.

---

## Part B — Frontend (`apps/admin-web`)

### B1. New dependencies

`i18next`, `react-i18next`. Skip `i18next-browser-languagedetector` (locale has a single source of truth: Redux, seeded from localStorage then reconciled from the backend). Skip `i18next-http-backend` (one static locale for now).

### B2. i18next init — new `src/i18n/` directory + `@i18n` alias

Structurally parallel to `src/theme/`. `src/i18n/index.ts` initializes the global i18next singleton (no `I18nextProvider` needed, matching the app's existing no-Context precedent from `theme`). `src/i18n/locales.ts` mirrors `src/theme/themes.ts` (`LocaleId`, `LOCALES`, `DEFAULT_LOCALE`, `LOCALE_STORAGE_KEY`, `getSavedLocale()`).

### B3. English message catalog

`src/i18n/locales/en/common.json`, nested keys grouped by feature/component area. Existing raw string literals across `App.tsx`, `theme-select.tsx`, and the `auth` feature migrate to `t('area.key')` calls.

### B4. `appSlice.ts` — new `locale` field

`AppState.locale: LocaleId`, seeded via `getSavedLocale()`. New `setLocale` reducer mirrors `setTheme`: updates state, writes `localStorage`, and calls `i18n.changeLanguage()` as a fire-and-forget side effect.

### B5. `LocaleSelector` + presentational `locale-select.tsx`

Mirrors `ThemeSelector`/`theme-select.tsx` exactly. Dispatches `setLocale` optimistically (Redux + localStorage + i18next, synchronous), then fires a `PATCH` to persist server-side. No toast library exists in this app, so PATCH failures are logged to console only, with no rollback of the optimistic state.

### B6. Minimal API client — `src/lib/api-client.ts`

Plain `fetch` wrapper (no axios). New `VITE_API_BASE_URL` env var (no prior env-var convention existed in admin-web). Exposes `login`, `getLocale`, `updateLocale`, parsing the coded `{ error: { code, message, params, fields } }` envelope into an `ApiClientError`.

### B7. `LoginForm.tsx` — real login call

Replaces the `setTimeout` mock with a real call to `login()`. Maps the response's `accessToken` to `authSlice`'s existing `token` field. Immediately hydrates locale via `getLocale()` after a successful login. `App.tsx` also gets a mount-time hydration effect for same-session remounts. Cross-reload token persistence remains explicitly out of scope.

### B8. Test coverage

New/extended Vitest + Testing Library suites for: `i18n/index`, `i18n/locales`, `appSlice`'s `setLocale`, `LocaleSelector`, `api-client`, and `LoginForm` (new — none existed before).

---

## Non-goals (explicitly out of scope, flagged during planning)

- Full `/me` profile endpoint or fetching real `email`/`role`/`name` from the backend.
- Cross-reload session persistence (localStorage bearer token or silent-refresh-on-boot via the refresh cookie).
- Toast/notification system for surfacing locale-PATCH failures (console-only for now).
- A second translated locale (English-only catalog; infrastructure supports adding one later).
- Fixing the admin-web/api dev-port collision or adding a general-purpose DB seed script (both pre-existing gaps noted above).

## Verification (end-to-end)

1. `pnpm install`, `pnpm --filter @tiny-threads/api db:migrate`.
2. Run API and admin-web dev servers on non-colliding ports.
3. In the browser: log in with real credentials → confirm a real `POST .../auth/login` and `GET .../me/locale` in the network tab → change locale via `LocaleSelector` → confirm instant UI update, `localStorage` write, and a `PATCH .../me/locale` call.
4. `pnpm --filter @tiny-threads/admin-web test` and `pnpm --filter @tiny-threads/api test` pass.
5. `pnpm lint` and `pnpm build` clean across the workspace.
