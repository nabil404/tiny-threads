import { NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Request, Response } from 'express';
import { DataSource } from 'typeorm';
import { TenantResolutionMiddleware } from '../tenant-resolution.middleware';

describe('TenantResolutionMiddleware', () => {
  function buildMiddleware(tenant: { id: string; host: string } | null) {
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

  function request(hostname: string) {
    return { hostname } as unknown as Request;
  }

  const res = {} as unknown as Response;

  it('resolves a tenant by an exact host match and sets it in CLS', async () => {
    const { middleware, set, findOne } = buildMiddleware({
      id: 'tenant-1',
      host: 'shop.tiny-threads.com',
    });
    const next = jest.fn();

    await middleware.use(request('shop.tiny-threads.com'), res, next);

    expect(findOne).toHaveBeenCalledWith({
      where: { host: 'shop.tiny-threads.com' },
    });
    expect(set).toHaveBeenCalledWith('tenantId', 'tenant-1');
    expect(next).toHaveBeenCalled();
  });

  it('resolves a tenant on a custom domain identically to a platform subdomain', async () => {
    const { middleware, set, findOne } = buildMiddleware({
      id: 'tenant-2',
      host: 'shop.merchantbrand.com',
    });
    const next = jest.fn();

    await middleware.use(request('shop.merchantbrand.com'), res, next);

    expect(findOne).toHaveBeenCalledWith({
      where: { host: 'shop.merchantbrand.com' },
    });
    expect(set).toHaveBeenCalledWith('tenantId', 'tenant-2');
    expect(next).toHaveBeenCalled();
  });

  it('throws NotFoundException when no tenant matches the host', async () => {
    const { middleware } = buildMiddleware(null);

    await expect(
      middleware.use(request('unknown.tiny-threads.com'), res, jest.fn()),
    ).rejects.toThrow(NotFoundException);
  });

  // Host headers are case-insensitive per RFC 9110, and browsers/proxies do
  // not normalize them, so a legitimate request must still resolve
  // regardless of case.
  it('resolves a tenant when the Host header is uppercase', async () => {
    const { middleware, set, findOne } = buildMiddleware({
      id: 'tenant-1',
      host: 'shop.tiny-threads.com',
    });
    const next = jest.fn();

    await middleware.use(request('SHOP.TINY-THREADS.COM'), res, next);

    expect(findOne).toHaveBeenCalledWith({
      where: { host: 'shop.tiny-threads.com' },
    });
    expect(set).toHaveBeenCalledWith('tenantId', 'tenant-1');
    expect(next).toHaveBeenCalled();
  });
});
