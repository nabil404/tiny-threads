import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';

// Guards the OAuth `returnUrl` against being used as an open redirect.
//
// The callback (GoogleOAuthController#callback) redirects the browser to
// whatever `returnUrl` was signed into the OAuth state, carrying either
// `?linkRequired=true` or `?code=<one-time-code>` — and that code is
// redeemable for a full access+refresh token pair. Because /google/initiate is
// unauthenticated, an attacker could otherwise call it themselves with
// `returnUrl=https://evil.example`, hand the resulting Google auth URL to a
// victim, and receive the victim's one-time code on their own server.
//
// The redirect target is therefore pinned to the hostname of the request that
// asked for it — the same hostname TenantResolutionMiddleware already resolved
// and confirmed belongs to a real tenant. That needs no allow-list and no new
// config, and keeps working if custom domains land later, since it is derived
// from the request's own already-validated host rather than a hardcoded list.
//
// Comparison is on `hostname` (port-excluded), not `host`, deliberately:
// TenantResolutionMiddleware itself derives the tenant slug from
// `req.hostname`, so the hostname is the actual tenancy boundary here, and in
// local development the API and the storefront legitimately run on different
// ports of the same host.
export function assertReturnUrlMatchesRequestHost(
  returnUrl: string,
  req: Request,
): void {
  let parsed: URL;
  try {
    parsed = new URL(returnUrl);
  } catch {
    throw new BadRequestException('returnUrl is not a valid absolute URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BadRequestException('returnUrl must be an http(s) URL');
  }
  if (parsed.hostname !== req.hostname) {
    throw new BadRequestException(
      'returnUrl must point at the same host as this request',
    );
  }
}
