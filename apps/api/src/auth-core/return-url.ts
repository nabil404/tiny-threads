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
// asked for it. That needs no allow-list and keeps working if custom domains
// land later, since it is derived from the request's own host rather than a
// hardcoded list.
//
// ⚠️ This is only sound because TenantResolutionMiddleware has already pinned
// req.hostname to the platform's own domain (PLATFORM_HOST_SUFFIX) and
// resolved it to a real tenant. req.hostname is otherwise just the
// client-supplied Host header: without that upstream check an attacker forging
// `Host: <real-slug>.evil.example` would control BOTH sides of the comparison
// below and sail straight through it. Never call this from a route excluded
// from that middleware.
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
  // URL.hostname is already lowercased (and punycoded) by the WHATWG parser,
  // but req.hostname is the raw Host header, which RFC 9110 makes
  // case-insensitive and which nothing normalizes. Comparing them directly
  // 400s a legitimate same-origin request that happened to send
  // `Host: SHOP.platform.com`.
  if (parsed.hostname !== req.hostname.toLowerCase()) {
    throw new BadRequestException(
      'returnUrl must point at the same host as this request',
    );
  }
}
