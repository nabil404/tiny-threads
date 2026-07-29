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
