import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { CustomersAuthService } from '../customers-auth.service';
import { TokenService } from '../../auth-core/token.service';
import { CustomerIdentity, CustomerRefreshToken } from '../../db/entities';

// NOTE: CustomersAuthService's constructor gains a fourth TokenService
// parameter in Task 10 (login/refresh/logout need it to sign access
// tokens). This helper takes a stub for it now so this file doesn't need
// editing again when Task 10 lands — Task 10 adds its own describe blocks
// using this same helper, passing a real TokenService where it matters.
//
// A fifth ClsService param was added during Task 9 review fix round 1 —
// register() needs tenantId (set into CLS by TenantResolutionMiddleware) to
// stamp it onto the Customer/CustomerIdentity rows it creates.
function buildService() {
  const manager = {
    findOne: jest.fn(),
    create: jest.fn((_entity: any, data: any) => data),
    save: jest.fn((entity: any) =>
      Promise.resolve({ id: 'generated-id', ...entity }),
    ),
  };
  const tenantDb = { run: jest.fn((work: any) => work(manager)) } as any;
  const hashing = {
    hash: jest.fn().mockResolvedValue('hashed-password'),
    verify: jest.fn(),
  } as any;
  const notifications = {
    sendEmail: jest.fn().mockResolvedValue(undefined),
  } as any;
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
  return { service, manager, hashing, notifications, tokenService, cls };
}

describe('CustomersAuthService.register', () => {
  it('creates a customer and a password identity, then sends a verification email', async () => {
    const { service, manager, hashing, notifications } = buildService();
    manager.findOne.mockResolvedValue(null);

    const result = await service.register({
      email: 'jane@example.com',
      password: 'correct horse battery staple',
      name: 'Jane',
    });

    expect(hashing.hash).toHaveBeenCalledWith('correct horse battery staple');
    expect(manager.save).toHaveBeenCalledTimes(2); // Customer, then CustomerIdentity
    expect(notifications.sendEmail).toHaveBeenCalledWith(
      'jane@example.com',
      'verification-email',
      expect.objectContaining({ token: expect.any(String) }),
    );
    expect(result).toEqual({ customerId: 'generated-id' });
  });

  it('stamps tenantId (read from CLS) onto both the customer and the identity it creates', async () => {
    const { service, manager, cls } = buildService();
    manager.findOne.mockResolvedValue(null);

    await service.register({
      email: 'jane@example.com',
      password: 'correct horse battery staple',
      name: 'Jane',
    });

    expect(cls.get).toHaveBeenCalledWith('tenantId');
    expect(manager.create).toHaveBeenCalledTimes(2);
    for (const [, data] of manager.create.mock.calls) {
      expect(data).toEqual(expect.objectContaining({ tenantId: 'tenant-1' }));
    }
  });

  it('rejects registration when the email already exists for this tenant', async () => {
    const { service, manager } = buildService();
    manager.findOne.mockResolvedValue({ id: 'existing-customer' });

    await expect(
      service.register({
        email: 'jane@example.com',
        password: 'correct horse battery staple',
        name: 'Jane',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('does not send the verification email when the DB transaction fails', async () => {
    const { service, manager, notifications } = buildService();
    manager.findOne.mockResolvedValue({ id: 'existing-customer' });

    await expect(
      service.register({
        email: 'jane@example.com',
        password: 'correct horse battery staple',
        name: 'Jane',
      }),
    ).rejects.toThrow(ConflictException);

    expect(notifications.sendEmail).not.toHaveBeenCalled();
  });

  it('sends the verification email only after the DB transaction has resolved', async () => {
    const { service, manager, notifications } = buildService();
    manager.findOne.mockResolvedValue(null);

    const callOrder: string[] = [];
    manager.save.mockImplementation((entity: any) => {
      callOrder.push('db-save');
      return Promise.resolve({ id: 'generated-id', ...entity });
    });
    notifications.sendEmail.mockImplementation(() => {
      callOrder.push('send-email');
      return Promise.resolve(undefined);
    });

    await service.register({
      email: 'jane@example.com',
      password: 'correct horse battery staple',
      name: 'Jane',
    });

    expect(callOrder).toEqual(['db-save', 'db-save', 'send-email']);
  });
});

describe('CustomersAuthService.login/refresh/logout', () => {
  // Distinct from buildService() above (which is register()-only and takes
  // a `hashing.verify` that's never called): this one drives manager.findOne
  // off the *entity* being queried rather than brittle where-shape matching,
  // and gives `hashing.verify` a real jest.fn() so login tests can flip it.
  //
  // NOTE: passes a `cls` stub as the 5th constructor arg — the brief's
  // original buildFullService only passed 4 (tenantDb, hashing,
  // notifications, tokenService), which predates the ClsService param added
  // during Task 9's fix round. Without it, `new CustomersAuthService(...)`
  // would silently bind `cls` to `undefined` and any CLS read elsewhere in
  // the class would throw.
  function buildFullService(options?: {
    identity?: Partial<CustomerIdentity> | null;
    refreshToken?: Partial<CustomerRefreshToken> | null;
  }) {
    const identity =
      options && 'identity' in options
        ? options.identity
        : {
            customerId: 'cust-1',
            passwordHash: 'hashed-password',
            emailVerified: true,
          };
    const refreshToken = options?.refreshToken ?? null;

    const manager = {
      findOne: jest.fn().mockImplementation((entity: unknown) => {
        if (entity === CustomerIdentity) return Promise.resolve(identity);
        if (entity === CustomerRefreshToken)
          return Promise.resolve(refreshToken);
        return Promise.resolve(null);
      }),
      create: jest.fn((_entity: unknown, data: any) => data),
      save: jest.fn((data: any) => Promise.resolve({ id: 'rt-1', ...data })),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const tenantDb = { run: jest.fn((work: any) => work(manager)) } as any;
    const hashing = {
      hash: jest.fn(),
      verify: jest.fn().mockResolvedValue(true),
    } as any;
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
    return { service, manager, hashing, tokenService, cls };
  }

  describe('login', () => {
    it('logs in with a correct password and returns an access+refresh token pair', async () => {
      const { service, hashing, manager } = buildFullService();

      const result = await service.login(
        'tenant-1',
        'jane@example.com',
        'correct password',
      );

      expect(hashing.verify).toHaveBeenCalledWith(
        'hashed-password',
        'correct password',
      );
      expect(result.accessToken).toEqual('signed-jwt');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.refreshToken.length).toBeGreaterThan(0);

      // The refresh token row must carry tenantId — CustomerRefreshToken
      // extends ImmutableTenantEntityBase (NOT NULL composite-PK column,
      // enforced by an RLS WITH CHECK policy), so an insert missing it
      // would fail against real Postgres.
      expect(manager.create).toHaveBeenCalledWith(
        CustomerRefreshToken,
        expect.objectContaining({ tenantId: 'tenant-1', customerId: 'cust-1' }),
      );
    });

    it('rejects login with an incorrect password', async () => {
      const { service, hashing } = buildFullService();
      hashing.verify.mockResolvedValue(false);

      await expect(
        service.login('tenant-1', 'jane@example.com', 'wrong'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects login when no password identity exists for the email', async () => {
      const { service } = buildFullService({ identity: null });

      await expect(
        service.login('tenant-1', 'unknown@example.com', 'whatever'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    function activeToken(overrides: Partial<CustomerRefreshToken> = {}) {
      return {
        id: 'rt-old',
        customerId: 'cust-1',
        tokenHash: 'existing-hash',
        familyId: 'family-1',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        ...overrides,
      };
    }

    it('rotates a valid refresh token: revokes the old one and issues a new pair in the same family', async () => {
      const { service, manager } = buildFullService({
        refreshToken: activeToken(),
      });

      const result = await service.refresh('tenant-1', 'raw-refresh-token');

      expect(result.accessToken).toEqual('signed-jwt');
      expect(typeof result.refreshToken).toBe('string');

      expect(manager.update).toHaveBeenCalledWith(
        CustomerRefreshToken,
        { id: 'rt-old' },
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
      expect(manager.create).toHaveBeenCalledWith(
        CustomerRefreshToken,
        expect.objectContaining({
          tenantId: 'tenant-1',
          customerId: 'cust-1',
          familyId: 'family-1',
        }),
      );
    });

    it('rejects an unknown refresh token', async () => {
      const { service } = buildFullService({ refreshToken: null });

      await expect(
        service.refresh('tenant-1', 'raw-refresh-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an expired refresh token', async () => {
      const { service } = buildFullService({
        refreshToken: activeToken({ expiresAt: new Date(Date.now() - 1000) }),
      });

      await expect(
        service.refresh('tenant-1', 'raw-refresh-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('treats reuse of an already-revoked token as theft and revokes the whole family', async () => {
      const { service, manager } = buildFullService({
        refreshToken: activeToken({ revokedAt: new Date() }),
      });

      await expect(
        service.refresh('tenant-1', 'raw-refresh-token'),
      ).rejects.toThrow(UnauthorizedException);

      expect(manager.update).toHaveBeenCalledWith(
        CustomerRefreshToken,
        { familyId: 'family-1' },
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
    });
  });

  describe('logout', () => {
    it('revokes the whole token family for a valid, active refresh token', async () => {
      const { service, manager } = buildFullService({
        refreshToken: {
          id: 'rt-1',
          customerId: 'cust-1',
          tokenHash: 'existing-hash',
          familyId: 'family-1',
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null,
        },
      });

      await service.logout('tenant-1', 'raw-refresh-token');

      expect(manager.update).toHaveBeenCalledWith(
        CustomerRefreshToken,
        { familyId: 'family-1' },
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
    });

    it('is a no-op when the refresh token does not exist', async () => {
      const { service, manager } = buildFullService({ refreshToken: null });

      await expect(
        service.logout('tenant-1', 'raw-refresh-token'),
      ).resolves.toBeUndefined();
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('is a no-op when the refresh token is already revoked', async () => {
      const { service, manager } = buildFullService({
        refreshToken: {
          id: 'rt-1',
          customerId: 'cust-1',
          tokenHash: 'existing-hash',
          familyId: 'family-1',
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: new Date(),
        },
      });

      await service.logout('tenant-1', 'raw-refresh-token');

      expect(manager.update).not.toHaveBeenCalled();
    });
  });
});
