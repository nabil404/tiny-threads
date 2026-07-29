import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { CustomerJwtStrategy } from '../strategies/customer-jwt.strategy';
import type { AccessTokenPayload } from '../../auth-core/services/token.service';
import type { EnvironmentVariables } from '../../config/env.validation';

// The two most load-bearing security properties of the access token are
// audience separation (a customer token must not authenticate a merchant admin
// route) and tenant binding (a token minted for tenant A must not authenticate
// a request arriving on tenant B's subdomain). Both are enforced only here, so
// they get direct coverage rather than being implied by higher-level tests.
function buildStrategy(clsTenantId: string | undefined) {
  const cls = {
    get: jest.fn().mockReturnValue(clsTenantId),
  } as unknown as ClsService;
  const configService = {
    get: jest.fn().mockReturnValue('test-jwt-secret'),
  } as unknown as ConfigService<EnvironmentVariables, true>;
  return { strategy: new CustomerJwtStrategy(cls, configService), cls };
}

describe('CustomerJwtStrategy#validate', () => {
  const customerPayload: AccessTokenPayload = {
    sub: 'cust-1',
    aud: 'customer',
    tenantId: 'tenant-a',
  };

  it('accepts a customer token whose tenantId matches the CLS-resolved tenant', () => {
    const { strategy } = buildStrategy('tenant-a');

    expect(strategy.validate(customerPayload)).toEqual(customerPayload);
  });

  it('rejects a customer token minted for a different tenant than the request resolved to', () => {
    // Same signing secret across tenants, so the signature is valid — only
    // this check stops tenant A's token from authenticating on tenant B.
    const { strategy } = buildStrategy('tenant-b');

    expect(() => strategy.validate(customerPayload)).toThrow(
      UnauthorizedException,
    );
    expect(() => strategy.validate(customerPayload)).toThrow(
      'Token tenant mismatch',
    );
  });

  it('rejects when no tenant was resolved for the request at all', () => {
    const { strategy } = buildStrategy(undefined);

    expect(() => strategy.validate(customerPayload)).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a merchant-admin token on a customer route even when the tenant matches', () => {
    const { strategy } = buildStrategy('tenant-a');

    expect(() =>
      strategy.validate({
        sub: 'mu-1',
        aud: 'merchant_admin',
        tenantId: 'tenant-a',
        role: 'owner',
      }),
    ).toThrow('Wrong token audience');
  });

  it('checks the audience before the tenant', () => {
    // A wrong-audience token must be rejected as such regardless of tenant, so
    // the error never leaks which tenant the request resolved to.
    const { strategy } = buildStrategy('tenant-b');

    expect(() =>
      strategy.validate({
        sub: 'mu-1',
        aud: 'merchant_admin',
        tenantId: 'tenant-a',
        role: 'owner',
      }),
    ).toThrow('Wrong token audience');
  });
});
