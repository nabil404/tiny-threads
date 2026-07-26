import { NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Request, Response } from 'express';
import { DataSource } from 'typeorm';
import { TenantResolutionMiddleware } from '../tenant-resolution.middleware';

describe('TenantResolutionMiddleware', () => {
  function buildMiddleware(tenant: { id: string; slug: string } | null) {
    const findOne = jest.fn().mockResolvedValue(tenant);
    const dataSource = {
      getRepository: jest.fn().mockReturnValue({ findOne }),
    } as unknown as DataSource;
    const set = jest.fn();
    const cls = { set } as unknown as ClsService;
    return {
      middleware: new TenantResolutionMiddleware(dataSource, cls),
      set,
      findOne,
    };
  }

  it('resolves tenant from the request subdomain and sets it in CLS', async () => {
    const { middleware, set, findOne } = buildMiddleware({
      id: 'tenant-1',
      slug: 'shop',
    });
    const req = { hostname: 'shop.platform.com' } as unknown as Request;
    const res = {} as unknown as Response;
    const next = jest.fn();

    await middleware.use(req, res, next);

    expect(findOne).toHaveBeenCalledWith({ where: { slug: 'shop' } });
    expect(set).toHaveBeenCalledWith('tenantId', 'tenant-1');
    expect(next).toHaveBeenCalled();
  });

  it('throws NotFoundException when no tenant matches the subdomain', async () => {
    const { middleware } = buildMiddleware(null);
    const req = { hostname: 'unknown.platform.com' } as unknown as Request;
    const res = {} as unknown as Response;

    await expect(middleware.use(req, res, jest.fn())).rejects.toThrow(
      NotFoundException,
    );
  });
});
