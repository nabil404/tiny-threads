import { Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { NextFunction, Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { Tenant } from '../db/entities';

// Resolves tenant_id from the request's subdomain (e.g. "shop.platform.com"
// -> slug "shop") and sets it in CLS for withTenant()/TenantDbService to
// read. Custom-domain resolution is a known follow-up, not implemented here.
@Injectable()
export class TenantResolutionMiddleware implements NestMiddleware {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cls: ClsService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const slug = req.hostname.split('.')[0];
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
