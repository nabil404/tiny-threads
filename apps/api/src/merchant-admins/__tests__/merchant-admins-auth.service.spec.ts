import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { MerchantAdminsAuthService } from '../merchant-admins-auth.service';
import { TokenService } from '../../auth-core/token.service';
import {
  MerchantUser,
  MerchantUserIdentity,
  MerchantUserInvite,
  MerchantUserRefreshToken,
} from '../../db/entities';

// Mirrors CustomersAuthService's buildService() shape (see
// customers-auth.service.spec.ts): a 5th ClsService constructor param is
// required because register() needs tenantId (set into CLS by
// TenantResolutionMiddleware) to stamp it onto the MerchantUser /
// MerchantUserIdentity rows it creates — both are NOT NULL composite-PK
// columns enforced by an RLS WITH CHECK policy.
//
// register() no longer takes email/role from the caller (fix round 1: a
// public, unauthenticated register endpoint must never let the caller
// self-select their own role) — it resolves both from a MerchantUserInvite
// row looked up by tokenHash, so this helper's manager.findOne routes by
// entity like buildFullService below, rather than by where-shape.
function buildService(options?: {
  invite?: Partial<MerchantUserInvite> | null;
  existingMerchantUser?: Partial<MerchantUser> | null;
}) {
  const invite =
    options && 'invite' in options
      ? options.invite
      : {
          id: 'invite-1',
          email: 'owner@shop.com',
          role: 'owner',
          tokenHash: 'invite-token-hash',
          expiresAt: new Date(Date.now() + 60_000),
          usedAt: null,
          invitedByMerchantUserId: 'mu-inviter',
        };
  const existingMerchantUser = options?.existingMerchantUser ?? null;

  const manager = {
    findOne: jest.fn().mockImplementation((entity: unknown) => {
      if (entity === MerchantUserInvite) return Promise.resolve(invite);
      if (entity === MerchantUser)
        return Promise.resolve(existingMerchantUser);
      return Promise.resolve(null);
    }),
    create: jest.fn((_entity: any, data: any) => data),
    save: jest.fn((entity: any) =>
      Promise.resolve({ id: 'generated-id', ...entity }),
    ),
    // Defaults to "the row was affected" so the conditional single-row
    // claim of the invite (WHERE id = $1 AND used_at IS NULL) reads as a
    // win-the-race outcome unless a test overrides it — mirrors the
    // refresh-token rotation race fix.
    update: jest.fn().mockResolvedValue({ affected: 1 }),
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
  const service = new MerchantAdminsAuthService(
    tenantDb,
    hashing,
    notifications,
    tokenService,
    cls,
  );
  return { service, manager, hashing, notifications, tokenService, cls };
}

describe('MerchantAdminsAuthService.register', () => {
  it('redeems a valid invite: creates a merchant user (with the invite email/role) and a password identity, then sends a verification email', async () => {
    const { service, manager, hashing, notifications } = buildService();

    const result = await service.register({
      token: 'raw-invite-token',
      password: 'correct horse battery staple',
    });

    expect(hashing.hash).toHaveBeenCalledWith('correct horse battery staple');
    expect(manager.save).toHaveBeenCalledTimes(2); // MerchantUser, then MerchantUserIdentity
    expect(manager.create).toHaveBeenCalledWith(
      MerchantUser,
      expect.objectContaining({
        tenantId: 'tenant-1',
        email: 'owner@shop.com',
        role: 'owner',
      }),
    );
    expect(notifications.sendEmail).toHaveBeenCalledWith(
      'owner@shop.com',
      'verification-email',
      expect.objectContaining({ token: expect.any(String) }),
    );
    expect(result).toEqual({ merchantUserId: 'generated-id' });
  });

  it('atomically claims the invite (single-row conditional update) before creating anything', async () => {
    const { service, manager } = buildService();

    await service.register({
      token: 'raw-invite-token',
      password: 'correct horse battery staple',
    });

    expect(manager.update).toHaveBeenCalledWith(
      MerchantUserInvite,
      expect.objectContaining({ id: 'invite-1', usedAt: expect.anything() }),
      expect.objectContaining({ usedAt: expect.any(Date) }),
    );
  });

  it('stamps tenantId (read from CLS) onto both the merchant user and the identity it creates', async () => {
    const { service, manager, cls } = buildService();

    await service.register({
      token: 'raw-invite-token',
      password: 'correct horse battery staple',
    });

    expect(cls.get).toHaveBeenCalledWith('tenantId');
    expect(manager.create).toHaveBeenCalledTimes(2);
    for (const [, data] of manager.create.mock.calls) {
      expect(data).toEqual(expect.objectContaining({ tenantId: 'tenant-1' }));
    }
  });

  it('rejects an unknown invite token', async () => {
    const { service } = buildService({ invite: null });

    await expect(
      service.register({
        token: 'bogus-token',
        password: 'correct horse battery staple',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects an already-used invite token', async () => {
    const { service } = buildService({
      invite: {
        id: 'invite-1',
        email: 'owner@shop.com',
        role: 'owner',
        tokenHash: 'invite-token-hash',
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: new Date(),
        invitedByMerchantUserId: 'mu-inviter',
      },
    });

    await expect(
      service.register({
        token: 'raw-invite-token',
        password: 'correct horse battery staple',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects an expired invite token', async () => {
    const { service } = buildService({
      invite: {
        id: 'invite-1',
        email: 'owner@shop.com',
        role: 'owner',
        tokenHash: 'invite-token-hash',
        expiresAt: new Date(Date.now() - 1000),
        usedAt: null,
        invitedByMerchantUserId: 'mu-inviter',
      },
    });

    await expect(
      service.register({
        token: 'raw-invite-token',
        password: 'correct horse battery staple',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('treats a lost invite-claim race (affected: 0) as an invalid token and does not create a merchant user', async () => {
    // Same TOCTOU shape as refresh()'s rotation race: two concurrent
    // register() calls could both read the same still-unused invite and
    // both pass the usedAt/expiresAt checks, but only one UPDATE ... WHERE
    // used_at IS NULL can ever match. The loser must not create a second
    // MerchantUser for the same invite.
    const { service, manager } = buildService();
    manager.update.mockResolvedValue({ affected: 0 });

    await expect(
      service.register({
        token: 'raw-invite-token',
        password: 'correct horse battery staple',
      }),
    ).rejects.toThrow(NotFoundException);

    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects registration when the email already exists for this tenant', async () => {
    const { service, manager } = buildService({
      existingMerchantUser: { id: 'existing-merchant-user' },
    });

    await expect(
      service.register({
        token: 'raw-invite-token',
        password: 'correct horse battery staple',
      }),
    ).rejects.toThrow(ConflictException);

    expect(manager.save).not.toHaveBeenCalled();
  });

  it('does not send the verification email when the DB transaction fails', async () => {
    const { service, notifications } = buildService({
      existingMerchantUser: { id: 'existing-merchant-user' },
    });

    await expect(
      service.register({
        token: 'raw-invite-token',
        password: 'correct horse battery staple',
      }),
    ).rejects.toThrow(ConflictException);

    expect(notifications.sendEmail).not.toHaveBeenCalled();
  });
});

describe('MerchantAdminsAuthService.inviteMember', () => {
  function buildInviteService() {
    const manager = {
      findOne: jest.fn(),
      create: jest.fn((_entity: any, data: any) => data),
      save: jest.fn((entity: any) =>
        Promise.resolve({ id: 'invite-generated-id', ...entity }),
      ),
    };
    const tenantDb = { run: jest.fn((work: any) => work(manager)) } as any;
    const hashing = { hash: jest.fn(), verify: jest.fn() } as any;
    const notifications = {
      sendEmail: jest.fn().mockResolvedValue(undefined),
    } as any;
    const tokenService = new TokenService({
      sign: jest.fn().mockReturnValue('signed-jwt'),
    } as any);
    const cls = { get: jest.fn().mockReturnValue('tenant-1') } as any;
    const service = new MerchantAdminsAuthService(
      tenantDb,
      hashing,
      notifications,
      tokenService,
      cls,
    );
    return { service, manager, notifications };
  }

  it('creates an invite stamped with tenantId and the inviting merchant user, then sends the invite email', async () => {
    const { service, manager, notifications } = buildInviteService();

    await service.inviteMember({
      tenantId: 'tenant-1',
      invitedByMerchantUserId: 'mu-inviter',
      invitedByRole: 'owner',
      email: 'new-hire@shop.com',
      role: 'staff',
    });

    expect(manager.create).toHaveBeenCalledWith(
      MerchantUserInvite,
      expect.objectContaining({
        tenantId: 'tenant-1',
        email: 'new-hire@shop.com',
        role: 'staff',
        invitedByMerchantUserId: 'mu-inviter',
        usedAt: null,
      }),
    );
    expect(manager.save).toHaveBeenCalledTimes(1);
    expect(notifications.sendEmail).toHaveBeenCalledWith(
      'new-hire@shop.com',
      'merchant-invite',
      expect.objectContaining({ token: expect.any(String) }),
    );

    // The raw invite token must never be returned to the caller — it can
    // only leave the system via the notification, same discipline as
    // verification/reset tokens elsewhere in this service.
    const [, , data] = notifications.sendEmail.mock.calls[0] as [
      string,
      string,
      { token: string },
    ];
    expect(typeof data.token).toBe('string');
    expect(data.token.length).toBeGreaterThan(0);
  });

  // Fix round 2 (security): RolesGuard/@Roles('owner', 'admin') on the
  // controller only checks the caller holds ONE of those roles — nothing
  // stopped an authenticated 'admin' from inviting someone in as 'owner',
  // which makes an admin credential equivalent to an owner credential and
  // defeats the entire point of having separate roles. inviteMember() must
  // reject granting a role that outranks the inviting caller's own role
  // (owner > admin > staff > viewer).
  describe('role-hierarchy enforcement', () => {
    it('rejects an admin inviting someone in as owner', async () => {
      const { service } = buildInviteService();

      await expect(
        service.inviteMember({
          tenantId: 'tenant-1',
          invitedByMerchantUserId: 'mu-admin',
          invitedByRole: 'admin',
          email: 'new-hire@shop.com',
          role: 'owner',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('does not create an invite or send an email when the hierarchy check rejects', async () => {
      const { service, manager, notifications } = buildInviteService();

      await expect(
        service.inviteMember({
          tenantId: 'tenant-1',
          invitedByMerchantUserId: 'mu-admin',
          invitedByRole: 'admin',
          email: 'new-hire@shop.com',
          role: 'owner',
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(manager.save).not.toHaveBeenCalled();
      expect(notifications.sendEmail).not.toHaveBeenCalled();
    });

    it.each(['staff', 'viewer', 'admin'])(
      'allows an admin to invite someone in as %s',
      async (role) => {
        const { service, notifications } = buildInviteService();

        await expect(
          service.inviteMember({
            tenantId: 'tenant-1',
            invitedByMerchantUserId: 'mu-admin',
            invitedByRole: 'admin',
            email: 'new-hire@shop.com',
            role,
          }),
        ).resolves.toBeUndefined();
        expect(notifications.sendEmail).toHaveBeenCalled();
      },
    );

    it.each(['owner', 'admin', 'staff', 'viewer'])(
      'allows an owner to invite someone in as %s',
      async (role) => {
        const { service, notifications } = buildInviteService();

        await expect(
          service.inviteMember({
            tenantId: 'tenant-1',
            invitedByMerchantUserId: 'mu-owner',
            invitedByRole: 'owner',
            email: 'new-hire@shop.com',
            role,
          }),
        ).resolves.toBeUndefined();
        expect(notifications.sendEmail).toHaveBeenCalled();
      },
    );
  });
});

describe('MerchantAdminsAuthService.login/refresh/logout', () => {
  // Distinct from buildService() above (register()-only): drives
  // manager.findOne off the *entity* being queried, and gives
  // `hashing.verify` a real jest.fn() so login tests can flip it.
  function buildFullService(options?: {
    merchantUser?: Partial<MerchantUser> | null;
    identity?: Partial<MerchantUserIdentity> | null;
    refreshToken?: Partial<MerchantUserRefreshToken> | null;
  }) {
    const merchantUser =
      options && 'merchantUser' in options
        ? options.merchantUser
        : { id: 'mu-1', role: 'owner' };
    const identity =
      options && 'identity' in options
        ? options.identity
        : { merchantUserId: 'mu-1', passwordHash: 'hashed-password' };
    const refreshToken = options?.refreshToken ?? null;

    const manager = {
      findOne: jest.fn().mockImplementation((entity: unknown) => {
        if (entity === MerchantUser) return Promise.resolve(merchantUser);
        if (entity === MerchantUserIdentity) return Promise.resolve(identity);
        if (entity === MerchantUserRefreshToken)
          return Promise.resolve(refreshToken);
        return Promise.resolve(null);
      }),
      create: jest.fn((_entity: unknown, data: any) => data),
      save: jest.fn((data: any) => Promise.resolve({ id: 'rt-1', ...data })),
      // Defaults to "the row was affected" so the conditional single-row
      // revoke in refresh() (WHERE id = $1 AND revoked_at IS NULL) reads as
      // a win-the-race outcome unless a test overrides it to simulate a
      // concurrent refresh() winning the race first.
      update: jest.fn().mockResolvedValue({ affected: 1 }),
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
    const service = new MerchantAdminsAuthService(
      tenantDb,
      hashing,
      notifications,
      tokenService,
      cls,
    );
    return { service, manager, hashing, tokenService, cls };
  }

  describe('login', () => {
    it('logs in with a correct password and returns an access+refresh token pair carrying the role claim', async () => {
      const { service, hashing, manager } = buildFullService();

      const result = await service.login(
        'tenant-1',
        'owner@shop.com',
        'correct password',
      );

      expect(hashing.verify).toHaveBeenCalledWith(
        'hashed-password',
        'correct password',
      );
      expect(result.accessToken).toEqual('signed-jwt');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.refreshToken.length).toBeGreaterThan(0);

      // The refresh token row must carry tenantId — MerchantUserRefreshToken
      // extends ImmutableTenantEntityBase (NOT NULL composite-PK column,
      // enforced by an RLS WITH CHECK policy), so an insert missing it
      // would fail against real Postgres.
      expect(manager.create).toHaveBeenCalledWith(
        MerchantUserRefreshToken,
        expect.objectContaining({
          tenantId: 'tenant-1',
          merchantUserId: 'mu-1',
        }),
      );
    });

    it('rejects login with an incorrect password', async () => {
      const { service, hashing } = buildFullService();
      hashing.verify.mockResolvedValue(false);

      await expect(
        service.login('tenant-1', 'owner@shop.com', 'wrong'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects login when no merchant user exists for the email', async () => {
      const { service } = buildFullService({ merchantUser: null });

      await expect(
        service.login('tenant-1', 'unknown@shop.com', 'whatever'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects login when no password identity exists for the merchant user', async () => {
      const { service } = buildFullService({ identity: null });

      await expect(
        service.login('tenant-1', 'owner@shop.com', 'whatever'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    function activeToken(overrides: Partial<MerchantUserRefreshToken> = {}) {
      return {
        id: 'rt-old',
        merchantUserId: 'mu-1',
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

      // The revoke must be conditional on revoked_at IS NULL (via TypeORM's
      // IsNull()), not a plain { id } update — see the race-loss test below
      // for why an unconditional revoke is unsafe.
      expect(manager.update).toHaveBeenCalledWith(
        MerchantUserRefreshToken,
        expect.objectContaining({ id: 'rt-old', revokedAt: expect.anything() }),
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
      expect(manager.create).toHaveBeenCalledWith(
        MerchantUserRefreshToken,
        expect.objectContaining({
          tenantId: 'tenant-1',
          merchantUserId: 'mu-1',
          familyId: 'family-1',
        }),
      );
    });

    it('treats a lost revoke race (affected: 0) as reuse: revokes the family and does not issue a new token pair', async () => {
      // Simulates the TOCTOU window: two concurrent refresh() calls read
      // the same still-valid row, both pass the revokedAt/expiresAt
      // checks, but only one UPDATE ... WHERE revoked_at IS NULL can ever
      // match. This test is the loser's perspective — affected: 0 on the
      // conditional single-row revoke.
      const { service, manager } = buildFullService({
        refreshToken: activeToken(),
      });
      manager.update.mockImplementation((_entity: unknown, where: any) => {
        if ('id' in where) {
          return Promise.resolve({ affected: 0 });
        }
        return Promise.resolve({ affected: 1 });
      });

      await expect(
        service.refresh('tenant-1', 'raw-refresh-token'),
      ).rejects.toThrow(UnauthorizedException);

      // Lost the race on the single-row conditional revoke...
      expect(manager.update).toHaveBeenCalledWith(
        MerchantUserRefreshToken,
        expect.objectContaining({ id: 'rt-old', revokedAt: expect.anything() }),
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
      // ...so the whole family gets revoked, same as any other reuse case.
      expect(manager.update).toHaveBeenCalledWith(
        MerchantUserRefreshToken,
        { familyId: 'family-1' },
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
      // Must not proceed to mint a successor token.
      expect(manager.create).not.toHaveBeenCalled();
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
        MerchantUserRefreshToken,
        { familyId: 'family-1' },
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
    });

    it('rejects when the merchant user backing the refresh token no longer exists', async () => {
      const { service } = buildFullService({
        merchantUser: null,
        refreshToken: activeToken(),
      });

      await expect(
        service.refresh('tenant-1', 'raw-refresh-token'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('revokes the whole token family for a valid, active refresh token', async () => {
      const { service, manager } = buildFullService({
        refreshToken: {
          id: 'rt-1',
          merchantUserId: 'mu-1',
          tokenHash: 'existing-hash',
          familyId: 'family-1',
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null,
        },
      });

      await service.logout('tenant-1', 'raw-refresh-token');

      expect(manager.update).toHaveBeenCalledWith(
        MerchantUserRefreshToken,
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
          merchantUserId: 'mu-1',
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
