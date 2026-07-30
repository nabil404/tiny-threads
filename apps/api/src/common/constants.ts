// Single source of truth for both the Nest-level prefix/versioning config
// (bootstrap.ts) and the auth controllers' refresh-cookie `path` — those
// cookies are scoped to the route path, so if this drifts from the actual
// route the browser stops sending the refresh token back on it.
export const API_PREFIX = 'api';
export const API_VERSION = '1';
export const API_ROUTE_PREFIX = `/${API_PREFIX}/v${API_VERSION}`;

export const AUTH_REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
} as const;

export const AUTH_TOKEN_TTL_MS = {
  EMAIL_VERIFICATION: 24 * 60 * 60 * 1000,
  REFRESH_TOKEN: 30 * 24 * 60 * 60 * 1000,
  PASSWORD_RESET: 60 * 60 * 1000,
  MERCHANT_INVITE: 7 * 24 * 60 * 60 * 1000,
  ONE_TIME_CODE: 60_000,
} as const;

export const AUTH_TOKEN_BYTE_LENGTH = 32;

export type AuthPopulation = 'customer' | 'merchant_admin';
