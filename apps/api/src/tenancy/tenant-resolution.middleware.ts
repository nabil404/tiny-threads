import { Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { NextFunction, Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { Tenant } from '../db/entities';

// A tenant slug must be a single DNS label — no dots, so `a.b.<suffix>` can
// never be read as the slug "a.b", and no characters outside what a slug can
// legitimately contain.
const SLUG_PATTERN = /^[a-z0-9-]+$/;

// Resolves tenant_id from the request's subdomain (e.g. "shop.platform.com"
// -> slug "shop") and sets it in CLS for withTenant()/TenantDbService to
// read. Custom-domain resolution is a known follow-up, not implemented here.
//
// ⚠️ req.hostname comes from the client-supplied Host header, so it is NOT
// trustworthy on its own. The host must therefore be pinned to the platform's
// own domain (PLATFORM_HOST_SUFFIX) before any part of it is believed.
// Without that check, an attacker forging `Host: <real-slug>.evil.example`
// would resolve the REAL tenant for that slug — the slug is genuine, only the
// parent domain is forged — which is an unauthenticated foothold on any
// tenant. It also makes req.hostname unsafe to reuse for anything else: the
// OAuth returnUrl origin check (auth-core/return-url.ts) compares against this
// same value, so a forged Host would satisfy BOTH sides of that comparison and
// re-open the open-redirect/session-theft chain it exists to close.
//
// Consequence: any route excluded from this middleware in AppModule has an
// UNVALIDATED req.hostname, and must not use it as a security input.
@Injectable()
export class TenantResolutionMiddleware implements NestMiddleware {
  private readonly hostSuffix: string;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cls: ClsService,
  ) {
    const suffix = process.env.PLATFORM_HOST_SUFFIX;
    if (!suffix) {
      throw new Error('PLATFORM_HOST_SUFFIX is not set');
    }
    // Normalize to a leading dot. This is load-bearing, not cosmetic: with a
    // bare "platform.com" suffix, `evilplatform.com` would end with it and
    // yield the slug "evil" on an attacker-owned domain — exactly the hole
    // this check exists to close. Prepending the dot makes the suffix a
    // subdomain boundary rather than a plain string tail.
    const lowered = suffix.toLowerCase();
    this.hostSuffix = lowered.startsWith('.') ? lowered : `.${lowered}`;
  }

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    // Host headers are case-insensitive per RFC 9110, and browsers/proxies do
    // not normalize them, so lowercase before comparing or looking up.
    const hostname = req.hostname.toLowerCase();

    // Every rejection below reuses the same NotFoundException as the unknown
    // tenant case, deliberately: a forged or malformed host must be
    // indistinguishable from a slug that simply does not exist, so this
    // endpoint can't be used to enumerate which tenants are real.
    if (!hostname.endsWith(this.hostSuffix)) {
      throw new NotFoundException('Unknown tenant');
    }
    const slug = hostname.slice(0, -this.hostSuffix.length);
    if (!SLUG_PATTERN.test(slug)) {
      throw new NotFoundException('Unknown tenant');
    }

    const tenant = await this.dataSource
      .getRepository(Tenant)
      .findOne({ where: { slug } });
    if (!tenant) {
      throw new NotFoundException('Unknown tenant');
    }
    this.cls.set('tenantId', tenant.id);
    next();
  }
}
