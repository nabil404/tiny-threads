import { Injectable } from '@nestjs/common';
import { generateOpaqueToken } from '../common/utils/refresh-token-crypto';
import { AUTH_TOKEN_TTL_MS, AuthPopulation } from '../common/constants';

export interface OneTimeCodePayload {
  population: AuthPopulation;
  // Bound to the tenant the tokens were minted for — the exchange endpoint
  // must check this against the redeeming request's own resolved tenant
  // (from CLS) before honoring the code, otherwise a code intercepted or
  // guessed within its TTL would be redeemable from any tenant's exchange
  // endpoint, not just the one the login/link actually happened on.
  tenantId: string;
  accessToken: string;
  refreshToken: string;
}

interface StoredEntry extends OneTimeCodePayload {
  expiresAt: number;
}

// Hands a real (access, refresh) token pair from the centralized Google
// callback (a platform domain) to a same-tenant-domain frontend via a
// short-lived, single-use opaque code instead of putting the tokens
// themselves in a redirect URL — a URL query param is logged by proxies,
// browser history, and Referer headers, so raw tokens must never travel
// through it.
//
// This is an in-memory, single-instance store: fine for local/dev and a
// single API instance, but a multi-instance production deployment needs a
// shared store (e.g. Redis) instead, since a code issued by the instance
// that handled the Google callback must be redeemable by whichever
// instance handles the exchange request.
@Injectable()
export class OneTimeCodeService {
  private readonly codes = new Map<string, StoredEntry>();

  // ttlMs is overridable (defaults to the real 60s TTL) purely so tests can
  // exercise expiry deterministically without faking global timers.
  issue(
    payload: OneTimeCodePayload,
    ttlMs: number = AUTH_TOKEN_TTL_MS.ONE_TIME_CODE,
  ): string {
    const code = generateOpaqueToken();
    this.codes.set(code, { ...payload, expiresAt: Date.now() + ttlMs });
    return code;
  }

  redeem(code: string): OneTimeCodePayload | null {
    const entry = this.codes.get(code);
    // Delete-on-read unconditionally (single-use), whether or not the code
    // was found or has expired.
    this.codes.delete(code);
    if (!entry || entry.expiresAt < Date.now()) {
      return null;
    }
    return {
      population: entry.population,
      tenantId: entry.tenantId,
      accessToken: entry.accessToken,
      refreshToken: entry.refreshToken,
    };
  }
}
