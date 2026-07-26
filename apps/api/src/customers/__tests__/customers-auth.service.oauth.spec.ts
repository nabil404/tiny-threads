import { ConflictException } from '@nestjs/common';
import { CustomersAuthService } from '../customers-auth.service';
import { CustomerIdentity } from '../../db/entities';
import { TokenService } from '../../auth-core/token.service';

// Mirrors buildFullService() in customers-auth.service.spec.ts, but drives
// manager.findOne off the where-clause shape (matching the brief's original
// test helper) since findOrCreateFromGoogle/linkGoogleIdentity issue several
// different findOne calls against the same entity (CustomerIdentity) with
// different `where` shapes, which an entity-keyed mock can't distinguish.
function buildService(existingCustomer: any, existingPasswordIdentity: any) {
  const manager = {
    findOne: jest.fn().mockImplementation((_entity: any, opts: any) => {
      if (opts.where.provider === 'google') return Promise.resolve(null);
      if (opts.where.email) return Promise.resolve(existingCustomer);
      if (opts.where.provider === 'password')
        return Promise.resolve(existingPasswordIdentity);
      return Promise.resolve(null);
    }),
    create: jest.fn((_entity: any, data: any) => data),
    save: jest.fn((data: any) => Promise.resolve({ id: 'rt-1', ...data })),
  };
  const tenantDb = { run: jest.fn((work: any) => work(manager)) } as any;
  const hashing = {} as any;
  const notifications = { sendEmail: jest.fn() } as any;
  const tokenService = new TokenService({
    sign: jest.fn().mockReturnValue('signed-jwt'),
  } as any);
  const cls = { get: jest.fn().mockReturnValue('tenant-1') } as any;
  const service = new CustomersAuthService(
    tenantDb,
    hashing,
    notifications,
    tokenService,
    cls,
  );
  return { service, manager };
}

describe('CustomersAuthService.findOrCreateFromGoogle', () => {
  it('auto-links when an existing password account matches and Google reports email_verified', async () => {
    const { service } = buildService(
      { id: 'cust-1', email: 'jane@example.com' },
      { customerId: 'cust-1' },
    );

    const result = await service.findOrCreateFromGoogle({
      tenantId: 'tenant-1',
      googleSub: 'google-sub-1',
      email: 'jane@example.com',
      emailVerified: true,
    });

    expect('accessToken' in result).toBe(true);
  });

  it('does NOT auto-link when Google reports an unverified email for a matching account', async () => {
    const { service } = buildService(
      { id: 'cust-1', email: 'jane@example.com' },
      { customerId: 'cust-1' },
    );

    const result = await service.findOrCreateFromGoogle({
      tenantId: 'tenant-1',
      googleSub: 'google-sub-1',
      email: 'jane@example.com',
      emailVerified: false,
    });

    expect(result).toEqual({ linkRequired: true });
  });

  it('stamps tenantId onto the Customer/CustomerIdentity rows it creates for a brand-new account', async () => {
    const { service, manager } = buildService(null, null);

    await service.findOrCreateFromGoogle({
      tenantId: 'tenant-1',
      googleSub: 'google-sub-1',
      email: 'new@example.com',
      emailVerified: true,
    });

    // tenant_id is a NOT NULL composite-PK column on both Customer and
    // CustomerIdentity, enforced by an RLS WITH CHECK policy — an insert
    // missing it would fail against real Postgres.
    expect(manager.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: 'tenant-1' }),
    );
    const calls = manager.create.mock.calls;
    for (const [, data] of calls) {
      expect(data).toEqual(expect.objectContaining({ tenantId: 'tenant-1' }));
    }
  });

  it('stamps tenantId onto the CustomerIdentity row it creates when auto-linking', async () => {
    const { service, manager } = buildService(
      { id: 'cust-1', email: 'jane@example.com' },
      { customerId: 'cust-1' },
    );

    await service.findOrCreateFromGoogle({
      tenantId: 'tenant-1',
      googleSub: 'google-sub-1',
      email: 'jane@example.com',
      emailVerified: true,
    });

    expect(manager.create).toHaveBeenCalledWith(
      CustomerIdentity,
      expect.objectContaining({ tenantId: 'tenant-1', provider: 'google' }),
    );
  });

  // Regression coverage for a review finding: the email_verified gate must
  // be structural ("don't attach a new Google identity to ANY pre-existing
  // customer unless Google vouches for the email"), not conditioned on a
  // password identity specifically existing on that customer. These two
  // tests use a customer row with NO password identity — previously that
  // combination fell through to the unconditional-create branch and bypassed
  // the gate entirely.
  it('does NOT auto-link when Google reports an unverified email for a matching account that has no password identity', async () => {
    const { service } = buildService(
      { id: 'cust-1', email: 'jane@example.com' },
      null,
    );

    const result = await service.findOrCreateFromGoogle({
      tenantId: 'tenant-1',
      googleSub: 'google-sub-1',
      email: 'jane@example.com',
      emailVerified: false,
    });

    expect(result).toEqual({ linkRequired: true });
  });

  it('auto-links when Google reports a verified email for a matching account that has no password identity', async () => {
    const { service, manager } = buildService(
      { id: 'cust-1', email: 'jane@example.com' },
      null,
    );

    const result = await service.findOrCreateFromGoogle({
      tenantId: 'tenant-1',
      googleSub: 'google-sub-1',
      email: 'jane@example.com',
      emailVerified: true,
    });

    expect('accessToken' in result).toBe(true);
    expect(manager.create).toHaveBeenCalledWith(
      CustomerIdentity,
      expect.objectContaining({
        tenantId: 'tenant-1',
        customerId: 'cust-1',
        provider: 'google',
      }),
    );
  });
});

describe('CustomersAuthService.linkGoogleIdentity', () => {
  function buildLinkService(conflictingIdentity: any) {
    const manager = {
      findOne: jest.fn().mockResolvedValue(conflictingIdentity),
      create: jest.fn((_entity: any, data: any) => data),
      save: jest.fn((data: any) => Promise.resolve({ id: 'ci-1', ...data })),
    };
    const tenantDb = { run: jest.fn((work: any) => work(manager)) } as any;
    const hashing = {} as any;
    const notifications = { sendEmail: jest.fn() } as any;
    const tokenService = new TokenService({
      sign: jest.fn().mockReturnValue('signed-jwt'),
    } as any);
    const cls = { get: jest.fn().mockReturnValue('tenant-1') } as any;
    const service = new CustomersAuthService(
      tenantDb,
      hashing,
      notifications,
      tokenService,
      cls,
    );
    return { service, manager };
  }

  it('stamps tenantId onto the CustomerIdentity row it creates', async () => {
    const { service, manager } = buildLinkService(null);

    await service.linkGoogleIdentity({
      tenantId: 'tenant-1',
      customerId: 'cust-1',
      googleSub: 'google-sub-1',
      email: 'jane@example.com',
    });

    expect(manager.create).toHaveBeenCalledWith(
      CustomerIdentity,
      expect.objectContaining({
        tenantId: 'tenant-1',
        customerId: 'cust-1',
        provider: 'google',
        emailVerified: true,
      }),
    );
  });

  it('rejects linking a Google identity already linked to a different customer', async () => {
    const { service } = buildLinkService({ customerId: 'cust-other' });

    await expect(
      service.linkGoogleIdentity({
        tenantId: 'tenant-1',
        customerId: 'cust-1',
        googleSub: 'google-sub-1',
        email: 'jane@example.com',
      }),
    ).rejects.toThrow(ConflictException);
  });
});
