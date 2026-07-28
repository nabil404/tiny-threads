import { NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Request, Response } from 'express';
import { DataSource } from 'typeorm';
import { TenantResolutionMiddleware } from '../tenant-resolution.middleware';

describe('TenantResolutionMiddleware', () => {
  function buildMiddleware(
    tenant: { id: string; slug: string } | null,
    hostSuffix = '.platform.com',
  ) {
    const previous = process.env.PLATFORM_HOST_SUFFIX;
    process.env.PLATFORM_HOST_SUFFIX = hostSuffix;
    try {
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
    } finally {
      if (previous === undefined) {
        delete process.env.PLATFORM_HOST_SUFFIX;
      } else {
        process.env.PLATFORM_HOST_SUFFIX = previous;
      }
    }
  }

  function request(hostname: string) {
    return { hostname } as unknown as Request;
  }

  const res = {} as unknown as Response;

  it('resolves tenant from the request subdomain and sets it in CLS', async () => {
    const { middleware, set, findOne } = buildMiddleware({
      id: 'tenant-1',
      slug: 'shop',
    });
    const next = jest.fn();

    await middleware.use(request('shop.platform.com'), res, next);

    expect(findOne).toHaveBeenCalledWith({ where: { slug: 'shop' } });
    expect(set).toHaveBeenCalledWith('tenantId', 'tenant-1');
    expect(next).toHaveBeenCalled();
  });

  it('throws NotFoundException when no tenant matches the subdomain', async () => {
    const { middleware } = buildMiddleware(null);

    await expect(
      middleware.use(request('unknown.platform.com'), res, jest.fn()),
    ).rejects.toThrow(NotFoundException);
  });

  it('requires PLATFORM_HOST_SUFFIX at construction time', () => {
    const previous = process.env.PLATFORM_HOST_SUFFIX;
    delete process.env.PLATFORM_HOST_SUFFIX;
    try {
      expect(
        () =>
          new TenantResolutionMiddleware(
            {} as unknown as DataSource,
            {} as unknown as ClsService,
          ),
      ).toThrow('PLATFORM_HOST_SUFFIX is not set');
    } finally {
      if (previous !== undefined) {
        process.env.PLATFORM_HOST_SUFFIX = previous;
      }
    }
  });

  // Regression coverage for the re-review finding: req.hostname is the
  // client-supplied Host header. Taking its first label as the tenant slug
  // without pinning the REST of the host to the platform's own domain let an
  // attacker forge `Host: <real-slug>.evil.example` — the slug is genuine, so
  // the REAL tenant resolved, handing them an unauthenticated foothold on it.
  // It also fed the OAuth returnUrl origin check the same forged value, so both
  // sides of that comparison were attacker-controlled and the open-redirect /
  // session-theft chain re-opened.
  describe('forged Host header', () => {
    it('rejects a valid slug on an attacker-controlled parent domain', async () => {
      const { middleware, findOne, set } = buildMiddleware({
        id: 'tenant-1',
        slug: 'shop',
      });

      await expect(
        middleware.use(request('shop.evil.com'), res, jest.fn()),
      ).rejects.toThrow(NotFoundException);
      // Must not even reach the database — nothing about the request is
      // trustworthy enough to look up.
      expect(findOne).not.toHaveBeenCalled();
      expect(set).not.toHaveBeenCalled();
    });

    it('rejects a suffix that only matches as a string tail, not a subdomain boundary', async () => {
      // "evilplatform.com" ends with "platform.com" as raw text. The leading
      // dot the middleware enforces is what stops this resolving as slug
      // "evil".
      const { middleware, findOne } = buildMiddleware(
        { id: 'tenant-1', slug: 'evil' },
        'platform.com',
      );

      await expect(
        middleware.use(request('evilplatform.com'), res, jest.fn()),
      ).rejects.toThrow(NotFoundException);
      expect(findOne).not.toHaveBeenCalled();
    });

    it('rejects a multi-label slug rather than reading it as one slug', async () => {
      const { middleware, findOne } = buildMiddleware({
        id: 'tenant-1',
        slug: 'a.b',
      });

      await expect(
        middleware.use(request('a.b.platform.com'), res, jest.fn()),
      ).rejects.toThrow(NotFoundException);
      expect(findOne).not.toHaveBeenCalled();
    });

    it('rejects the bare platform apex with no tenant label', async () => {
      const { middleware, findOne } = buildMiddleware({
        id: 'tenant-1',
        slug: '',
      });

      await expect(
        middleware.use(request('platform.com'), res, jest.fn()),
      ).rejects.toThrow(NotFoundException);
      expect(findOne).not.toHaveBeenCalled();
    });

    it('rejects a host that is only the suffix, leaving an empty slug', async () => {
      const { middleware, findOne } = buildMiddleware({
        id: 'tenant-1',
        slug: '',
      });

      await expect(
        middleware.use(request('.platform.com'), res, jest.fn()),
      ).rejects.toThrow(NotFoundException);
      expect(findOne).not.toHaveBeenCalled();
    });

    it('rejects an IP-address Host', async () => {
      const { middleware, findOne } = buildMiddleware({
        id: 'tenant-1',
        slug: 'shop',
      });

      await expect(
        middleware.use(request('10.0.0.5'), res, jest.fn()),
      ).rejects.toThrow(NotFoundException);
      expect(findOne).not.toHaveBeenCalled();
    });
  });

  // Host headers are case-insensitive per RFC 9110 and nothing normalizes them
  // on the way in, so a legitimate request must still resolve regardless of
  // case.
  it('resolves a tenant when the Host header is uppercase', async () => {
    const { middleware, set, findOne } = buildMiddleware({
      id: 'tenant-1',
      slug: 'shop',
    });
    const next = jest.fn();

    await middleware.use(request('SHOP.PLATFORM.COM'), res, next);

    expect(findOne).toHaveBeenCalledWith({ where: { slug: 'shop' } });
    expect(set).toHaveBeenCalledWith('tenantId', 'tenant-1');
    expect(next).toHaveBeenCalled();
  });

  it('tolerates a configured suffix without a leading dot', async () => {
    const { middleware, findOne, set } = buildMiddleware(
      { id: 'tenant-1', slug: 'shop' },
      'platform.com',
    );
    const next = jest.fn();

    await middleware.use(request('shop.platform.com'), res, next);

    expect(findOne).toHaveBeenCalledWith({ where: { slug: 'shop' } });
    expect(set).toHaveBeenCalledWith('tenantId', 'tenant-1');
  });

  it('tolerates a configured suffix in mixed case', async () => {
    const { middleware, findOne } = buildMiddleware(
      { id: 'tenant-1', slug: 'shop' },
      '.Platform.COM',
    );

    await middleware.use(request('shop.platform.com'), res, jest.fn());

    expect(findOne).toHaveBeenCalledWith({ where: { slug: 'shop' } });
  });

  it('resolves a hyphenated slug', async () => {
    const { middleware, findOne } = buildMiddleware({
      id: 'tenant-1',
      slug: 'my-shop-2',
    });

    await middleware.use(request('my-shop-2.platform.com'), res, jest.fn());

    expect(findOne).toHaveBeenCalledWith({ where: { slug: 'my-shop-2' } });
  });
});
