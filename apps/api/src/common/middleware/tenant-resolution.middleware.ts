import { Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { NextFunction, Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { Tenant } from '../../db/entities';

// Resolves tenant_id from the request's Host header via an exact match
// against tenants.host, and sets it in CLS for withTenant()/TenantDbService
// to read. One tenant, one host — a custom domain and a platform subdomain
// are resolved identically, since both are just rows in this table.
//
// ⚠️ req.hostname is the client-supplied Host header. Trust in it comes
// entirely from this exact-match lookup: it either matches a real tenant's
// registered host, or it matches nothing and gets the same 404 as an unknown
// tenant. There is no separate "is this host trustworthy" step the way a
// shared-suffix scheme would need. That also makes req.hostname unsafe to
// reuse for anything else on a route that skips this middleware: the OAuth
// returnUrl origin check (common/utils/return-url.ts) compares against this same
// value, and depends on this lookup having already run.
//
// Consequence: any route excluded from this middleware in AppModule has an
// UNVALIDATED req.hostname, and must not use it as a security input.
@Injectable()
export class TenantResolutionMiddleware implements NestMiddleware {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cls: ClsService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    // Host headers are case-insensitive per RFC 9110, and browsers/proxies do
    // not normalize them, so lowercase before comparing or looking up.
    const hostname = req.hostname.toLowerCase();

    const tenant = await this.dataSource
      .getRepository(Tenant)
      .findOne({ where: { host: hostname } });
    if (!tenant) {
      throw new NotFoundException('Unknown tenant');
    }
    this.cls.set('tenantId', tenant.id);
    next();
  }
}
