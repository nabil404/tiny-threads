import { BadRequestException } from '@nestjs/common';
import { MerchantAdminsAuthController } from '../merchant-admins-auth.controller';

// Mirrors CustomersAuthController#exchangeGoogleCode's test (see
// apps/api/src/customers/__tests__/customers-auth.controller.oauth-exchange.spec.ts) —
// same tenant-binding and population checks, against the merchant-admin
// exchange endpoint.
function buildController(options?: {
  redeemedPayload?: {
    population: 'customer' | 'merchant_admin';
    tenantId: string;
    accessToken: string;
    refreshToken: string;
  } | null;
  requestTenantId?: string;
}) {
  const merchantAdminsAuthService = {} as any;
  const cls = {
    get: jest.fn().mockReturnValue(options?.requestTenantId ?? 'tenant-1'),
  } as any;
  const oauthState = {} as any;
  const oneTimeCodeService = {
    redeem: jest.fn().mockReturnValue(
      options && 'redeemedPayload' in options
        ? options.redeemedPayload
        : {
            population: 'merchant_admin' as const,
            tenantId: 'tenant-1',
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
          },
    ),
  } as any;

  const controller = new MerchantAdminsAuthController(
    merchantAdminsAuthService,
    cls,
    oauthState,
    oneTimeCodeService,
    { get: jest.fn() } as any,
  );

  return { controller, cls, oneTimeCodeService };
}

describe('MerchantAdminsAuthController#exchangeGoogleCode', () => {
  it('sets the refresh cookie and returns the access token for a valid, same-tenant code', () => {
    const { controller } = buildController();
    const res = { cookie: jest.fn() } as any;

    const result = controller.exchangeGoogleCode({ code: 'a-code' }, res);

    expect(res.cookie).toHaveBeenCalledWith(
      'merchant_admin_refresh_token',
      'refresh-token',
      expect.objectContaining({ httpOnly: true }),
    );
    expect(result).toEqual({ accessToken: 'access-token' });
  });

  it('rejects a code minted for a different tenant than the requesting one', () => {
    const { controller } = buildController({ requestTenantId: 'tenant-2' });
    const res = { cookie: jest.fn() } as any;

    expect(() =>
      controller.exchangeGoogleCode({ code: 'a-code' }, res),
    ).toThrow(BadRequestException);
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('rejects when the code was never issued or has already been redeemed', () => {
    const { controller } = buildController({ redeemedPayload: null });
    const res = { cookie: jest.fn() } as any;

    expect(() =>
      controller.exchangeGoogleCode({ code: 'a-code' }, res),
    ).toThrow(BadRequestException);
  });

  it('rejects a code minted for a different population', () => {
    const { controller } = buildController({
      redeemedPayload: {
        population: 'customer',
        tenantId: 'tenant-1',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    });
    const res = { cookie: jest.fn() } as any;

    expect(() =>
      controller.exchangeGoogleCode({ code: 'a-code' }, res),
    ).toThrow(BadRequestException);
  });
});
