import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

export type OAuthPopulation = 'customer' | 'merchant_admin';

export interface OneTimeCodePayload {
  population: OAuthPopulation;
  accessToken: string;
  refreshToken: string;
}

interface StoredEntry extends OneTimeCodePayload {
  expiresAt: number;
}

const CODE_TTL_MS = 60_000;

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

  issue(payload: OneTimeCodePayload): string {
    const code = randomBytes(32).toString('base64url');
    this.codes.set(code, { ...payload, expiresAt: Date.now() + CODE_TTL_MS });
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
      accessToken: entry.accessToken,
      refreshToken: entry.refreshToken,
    };
  }
}
