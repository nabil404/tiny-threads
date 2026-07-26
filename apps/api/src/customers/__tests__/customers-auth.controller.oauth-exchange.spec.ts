import { BadRequestException } from '@nestjs/common';
import { CustomersAuthController } from '../customers-auth.controller';

// Covers CustomersAuthController#exchangeGoogleCode in isolation — the
// tenant-binding check on the one-time code (a code minted for tenant A must
// not be redeemable against tenant B's exchange endpoint, even within its
// TTL) and the basic success/invalid-code paths.
function buildController(options?: {
  redeemedPayload?: {
    population: 'customer' | 'merchant_admin';
    tenantId: string;
    accessToken: string;
    refreshToken: string;
  } | null;
  requestTenantId?: string;
}) {
  const customersAuthService = {} as any;
  const cls = {
    get: jest.fn().mockReturnValue(options?.requestTenantId ?? 'tenant-1'),
  } as any;
  const oauthState = {} as any;
  const oneTimeCodeService = {
    redeem: jest.fn().mockReturnValue(
      options && 'redeemedPayload' in options
        ? options.redeemedPayload
        : {
            population: 'customer' as const,
            tenantId: 'tenant-1',
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
          },
    ),
  } as any;

  const controller = new CustomersAuthController(
    customersAuthService,
    cls,
    oauthState,
    oneTimeCodeService,
  );

  return { controller, cls, oneTimeCodeService };
}

describe('CustomersAuthController#exchangeGoogleCode', () => {
  it('sets the refresh cookie and returns the access token for a valid, same-tenant code', () => {
    const { controller } = buildController();
    const res = { cookie: jest.fn() } as any;

    const result = controller.exchangeGoogleCode({ code: 'a-code' }, res);

    expect(res.cookie).toHaveBeenCalledWith(
      'customer_refresh_token',
      'refresh-token',
      expect.objectContaining({ httpOnly: true }),
    );
    expect(result).toEqual({ accessToken: 'access-token' });
  });

  it('rejects a code minted for a different tenant than the requesting one', () => {
    const { controller } = buildController({ requestTenantId: 'tenant-2' });
    const res = { cookie: jest.fn() } as any;

    expect(() => controller.exchangeGoogleCode({ code: 'a-code' }, res)).toThrow(
      BadRequestException,
    );
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('rejects when the code was never issued or has already been redeemed', () => {
    const { controller } = buildController({ redeemedPayload: null });
    const res = { cookie: jest.fn() } as any;

    expect(() => controller.exchangeGoogleCode({ code: 'a-code' }, res)).toThrow(
      BadRequestException,
    );
  });

  it('rejects a code minted for a different population', () => {
    const { controller } = buildController({
      redeemedPayload: {
        population: 'merchant_admin',
        tenantId: 'tenant-1',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    });
    const res = { cookie: jest.fn() } as any;

    expect(() => controller.exchangeGoogleCode({ code: 'a-code' }, res)).toThrow(
      BadRequestException,
    );
  });
});
