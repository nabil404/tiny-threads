# NestJS env var config — design

## Problem

`process.env` is read directly and inconsistently across `apps/api`: `main.ts`,
two JWT strategies, two OAuth controllers, `auth-core.module.ts`,
`oauth-state.service.ts`, `database.module.ts`, and `data-source.ts`. Five of
these sites (`customer-jwt.strategy.ts`, `merchant-admin-jwt.strategy.ts`,
`auth-core.module.ts`, `oauth-state.service.ts`, `google-oauth.controller.ts`)
each carry their own `if (!process.env.X) throw new Error(...)` guard,
duplicating the same fail-fast intent five different ways. A boot with two
missing secrets fails on whichever is instantiated first, and only reveals the
second after the first is fixed and the app is restarted. There is no single
place that defines what env vars this app needs or validates them together.

## Decision

Add `@nestjs/config`, wired through one validated schema class, and migrate
every existing `process.env` read to go through it. `data-source.ts` — the
TypeORM CLI entry point, which runs outside Nest's DI container — reuses the
same validation function directly rather than duplicating rules.

## Schema

New `apps/api/src/config/env.validation.ts`, no Nest imports:

```ts
import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
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
  @IsString()
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

`DATABASE_URL`, `DATABASE_URL_MIGRATIONS`, `JWT_SECRET`, `OAUTH_STATE_SECRET`,
`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and `PLATFORM_BASE_URL`
are marked required (rather than optional-with-runtime-checks): this is the
deliberate change that lets the five scattered guards be deleted, since a
validated `ConfigService`/`validate()` result guarantees the value exists.
`NODE_ENV` and `PORT` stay optional — both already have fallback behavior at
their call sites (`NODE_ENV === 'production'` checks, `PORT ?? 3000`).

## Wiring

`apps/api/package.json` gains `@nestjs/config` as a dependency.

`apps/api/src/app/app.module.ts` imports:

```ts
ConfigModule.forRoot({
  isGlobal: true,
  ignoreEnvFile: true,
  validate,
})
```

`isGlobal: true` mirrors the existing `@Global()` pattern on `DatabaseModule`
— no feature module needs to import `ConfigModule` itself, only inject
`ConfigService`. `ignoreEnvFile: true` because `main.ts` already runs
`dotenv.config({ path: resolve(__dirname, '../../../.env') })` against the
repo-root `.env` before `NestFactory.create(AppModule)` is even called, so
`process.env` is already populated by the time `ConfigModule`'s `validate`
runs; letting `ConfigModule` also search for a `.env` (relative to `cwd`,
which is `apps/api` under the pnpm filter) would be redundant and could mask
which file actually won.

`apps/api/src/db/data-source.ts` (CLI-only, no Nest DI) keeps its existing
`dotenv.config({ path: ... })` call, then replaces its manual
`if (!process.env.DATABASE_URL_MIGRATIONS) throw` with:

```ts
import { validate } from '../config/env.validation';
const env = validate(process.env);
// ...
url: env.DATABASE_URL_MIGRATIONS,
ssl: env.NODE_ENV === 'production',
logging: env.NODE_ENV === 'development',
```

## Call-site migration

Every site below injects `ConfigService<EnvironmentVariables, true>` (the
`true` type param makes `.get` strict, so its return type has no
`| undefined`) and reads values via `configService.get('X', { infer: true })`.
No site changes behavior beyond centralizing the fail-fast check — same
values, same runtime behavior.

| File | Change |
|---|---|
| `main.ts` | `configService.get('PORT', { infer: true }) ?? 3000` |
| `db/database.module.ts` | `TypeOrmModule.forRootAsync({ inject: [ConfigService], useFactory: (config) => ({ url: config.get('DATABASE_URL', { infer: true }), ... }) })` |
| `customers/customer-jwt.strategy.ts` | drop `if (!secret) throw`; `secretOrKey: configService.get('JWT_SECRET', { infer: true })` |
| `merchant-admins/merchant-admin-jwt.strategy.ts` | same as above |
| `auth-core/auth-core.module.ts` (`JwtModule.registerAsync`) | drop the guard; `inject: [ConfigService]`, `useFactory: (config) => ({ secret: config.get('JWT_SECRET', { infer: true }) })` |
| `auth-core/oauth-state.service.ts` | drop the guard; constructor takes `ConfigService`, reads `OAUTH_STATE_SECRET` |
| `oauth/google-oauth.controller.ts` | drop the manual `PLATFORM_BASE_URL` check; inject `ConfigService` for `PLATFORM_BASE_URL`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` |
| `customers/customers-auth.controller.ts` | inject `ConfigService` for `GOOGLE_OAUTH_CLIENT_ID` and `PLATFORM_BASE_URL` |
| `merchant-admins/merchant-admins-auth.controller.ts` | same as above |

## Error handling

`ConfigModule.forRoot({ validate })` runs `validate(process.env)`
synchronously during module instantiation, before any controller, strategy,
or `TypeOrmModule.forRootAsync` factory runs. If any required var is missing
or malformed, the app throws at boot with one `Error` whose message lists
every failing property (`class-validator`'s `errors.toString()`), and the
process never reaches `app.listen(...)`. `data-source.ts` gets the same
behavior for migrations — `validate(process.env)` throws immediately if
`DATABASE_URL_MIGRATIONS` is missing, before TypeORM attempts to connect.

## Testing

- `apps/api/src/config/__tests__/env.validation.spec.ts` — unit tests for
  `validate()`: passes given a complete valid env object; throws when each
  required var is missing (table-driven); throws on an invalid `NODE_ENV`
  enum value; passes when `NODE_ENV`/`PORT` are omitted.
- Existing specs for the migrated call sites (`customer-jwt.strategy`,
  `merchant-admin-jwt.strategy`, `oauth-state.service`,
  `google-oauth.controller`, `auth-core.module`, the two auth controllers)
  update to construct a mock `ConfigService`
  (`{ get: jest.fn().mockReturnValue('test-value') }`) instead of setting
  `process.env.X` before construction.

## Documentation updates

- `.env.example` — content unchanged, but gains a short header comment noting
  these vars are validated at boot via `src/config/env.validation.ts`, so a
  missing one fails fast with a clear message.

## Out of scope

- Namespaced `registerAs()` config factories per domain (database, jwt,
  oauth, app) — not needed at the current ~9-variable surface; revisit if
  config grows enough that domain modules want to own their own config shape
  independently (see architecture doc's provider-port pattern for the
  precedent).
- A hand-written `AppConfigService` wrapper exposing typed getters
  (`appConfig.jwtSecret`) — `ConfigService<EnvironmentVariables, true>`'s
  built-in generic already gives full type inference without an extra layer.
- Any change to which env vars exist or their values — this is a mechanical
  refactor of how they're read and validated, not a change to configuration
  itself.
