import { UnauthorizedException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { MerchantAdminJwtStrategy } from '../merchant-admin-jwt.strategy';
import type { AccessTokenPayload } from '../../auth-core/token.service';

// Mirrors customer-jwt.strategy.spec.ts — direct coverage for the audience
// separation and tenant binding enforced by this strategy (see there for the
// rationale on why these two properties get dedicated tests).
function buildStrategy(clsTenantId: string | undefined) {
  const cls = {
    get: jest.fn().mockReturnValue(clsTenantId),
  } as unknown as ClsService;
  return { strategy: new MerchantAdminJwtStrategy(cls), cls };
}

beforeAll(() => {
  process.env.JWT_SECRET = 'test-jwt-secret';
});

describe('MerchantAdminJwtStrategy#validate', () => {
  const merchantAdminPayload: AccessTokenPayload = {
    sub: 'mu-1',
    aud: 'merchant_admin',
    tenantId: 'tenant-a',
    role: 'owner',
  };

  it('accepts a merchant-admin token whose tenantId matches the CLS-resolved tenant', () => {
    const { strategy } = buildStrategy('tenant-a');

    expect(strategy.validate(merchantAdminPayload)).toEqual(
      merchantAdminPayload,
    );
  });

  it('rejects a merchant-admin token minted for a different tenant than the request resolved to', () => {
    // An owner token for tenant A must not act as an owner on tenant B — this
    // is the cross-tenant privilege escalation the check exists to stop.
    const { strategy } = buildStrategy('tenant-b');

    expect(() => strategy.validate(merchantAdminPayload)).toThrow(
      UnauthorizedException,
    );
    expect(() => strategy.validate(merchantAdminPayload)).toThrow(
      'Token tenant mismatch',
    );
  });

  it('rejects when no tenant was resolved for the request at all', () => {
    const { strategy } = buildStrategy(undefined);

    expect(() => strategy.validate(merchantAdminPayload)).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a customer token on a merchant-admin route even when the tenant matches', () => {
    const { strategy } = buildStrategy('tenant-a');

    expect(() =>
      strategy.validate({
        sub: 'cust-1',
        aud: 'customer',
        tenantId: 'tenant-a',
      }),
    ).toThrow('Wrong token audience');
  });

  it('checks the audience before the tenant', () => {
    const { strategy } = buildStrategy('tenant-b');

    expect(() =>
      strategy.validate({
        sub: 'cust-1',
        aud: 'customer',
        tenantId: 'tenant-a',
      }),
    ).toThrow('Wrong token audience');
  });
});
