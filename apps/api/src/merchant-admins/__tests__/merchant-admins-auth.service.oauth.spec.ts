import { MerchantAdminsAuthService } from '../merchant-admins-auth.service';
import { MerchantUserIdentity } from '../../db/entities';
import { TokenService } from '../../auth-core/services/token.service';

// Mirrors CustomersAuthService.findOrCreateFromGoogle (Task 11) against
// MerchantUser/MerchantUserIdentity — see Task 11, Step 2 for the customer
// equivalent of this test.
function buildService(
  existingMerchantUser: any,
  existingPasswordIdentity: any,
) {
  const manager = {
    findOne: jest.fn().mockImplementation((entity: any, opts: any) => {
      if (opts.where.email) return Promise.resolve(existingMerchantUser);
      if (opts.where.provider === 'password')
        return Promise.resolve(existingPasswordIdentity);
      if (opts.where.provider === 'google') return Promise.resolve(null);
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
  const cls = { get: jest.fn(), set: jest.fn() } as any;
  return {
    service: new MerchantAdminsAuthService(
      tenantDb,
      hashing,
      notifications,
      tokenService,
      cls,
    ),
    manager,
  };
}

describe('MerchantAdminsAuthService.findOrCreateFromGoogle', () => {
  it('auto-links when Google reports a verified email matching an existing password account', async () => {
    const { service } = buildService(
      { id: 'mu-1', email: 'owner@shop.com', role: 'owner' },
      { merchantUserId: 'mu-1', emailVerified: true },
    );

    const result = await service.findOrCreateFromGoogle({
      tenantId: 'tenant-1',
      googleSub: 'google-sub-1',
      email: 'owner@shop.com',
      emailVerified: true,
    });

    expect('accessToken' in result).toBe(true);
  });

  // Regression test for the tenantId-omission bug: MerchantUserIdentity has
  // tenant_id as a NOT NULL composite-PK column enforced by an RLS WITH
  // CHECK policy. If the auto-link branch's manager.create(...) call omits
  // tenantId, the insert violates that policy in production (RLS) even
  // though this mocked manager wouldn't catch it any other way.
  it('stamps tenantId on the newly-created google identity when auto-linking', async () => {
    const { service, manager } = buildService(
      { id: 'mu-1', email: 'owner@shop.com', role: 'owner' },
      { merchantUserId: 'mu-1', emailVerified: true },
    );

    await service.findOrCreateFromGoogle({
      tenantId: 'tenant-1',
      googleSub: 'google-sub-1',
      email: 'owner@shop.com',
      emailVerified: true,
    });

    expect(manager.create).toHaveBeenCalledWith(
      MerchantUserIdentity,
      expect.objectContaining({ tenantId: 'tenant-1' }),
    );
  });

  // Regression coverage for final-review finding C2 (pre-account-hijacking):
  // Google's email_verified claim says nothing about whether OUR OWN
  // verifyEmail() flow ever proved the local password account on that email.
  // Auto-linking onto an unverified password identity would leave the person
  // who set that password and the real Google account holder sharing one
  // merchant admin account.
  it('does not auto-link when the existing password identity has never been verified locally, even when Google reports email_verified=true', async () => {
    const { service, manager } = buildService(
      { id: 'mu-1', email: 'owner@shop.com', role: 'owner' },
      { merchantUserId: 'mu-1', emailVerified: false },
    );

    const result = await service.findOrCreateFromGoogle({
      tenantId: 'tenant-1',
      googleSub: 'google-sub-1',
      email: 'owner@shop.com',
      emailVerified: true,
    });

    expect(result).toEqual({ linkRequired: true });
    expect('accessToken' in result).toBe(false);
    // No google identity row may be created on the unverified account.
    expect(manager.create).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('does not auto-link an unverified Google email onto an existing account', async () => {
    const { service } = buildService(
      { id: 'mu-1', email: 'owner@shop.com', role: 'owner' },
      { merchantUserId: 'mu-1', emailVerified: true },
    );

    const result = await service.findOrCreateFromGoogle({
      tenantId: 'tenant-1',
      googleSub: 'google-sub-1',
      email: 'owner@shop.com',
      emailVerified: false,
    });

    expect(result).toEqual({ linkRequired: true });
  });
});
