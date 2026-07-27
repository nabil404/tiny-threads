import { BadRequestException } from '@nestjs/common';
import { CustomersAuthController } from '../customers-auth.controller';

// Regression coverage for the final-review finding C1: /google/initiate is
// unauthenticated and the returnUrl it accepts is where the OAuth callback
// later delivers a one-time code redeemable for a full token pair. Without an
// origin check it is an open redirect that leaks victim sessions.
function buildController() {
  const customersAuthService = {} as any;
  const cls = { get: jest.fn().mockReturnValue('tenant-1') } as any;
  const oauthState = {
    encode: jest.fn().mockReturnValue('signed-state'),
  } as any;
  const oneTimeCodeService = {} as any;

  const controller = new CustomersAuthController(
    customersAuthService,
    cls,
    oauthState,
    oneTimeCodeService,
  );

  return { controller, oauthState };
}

// Only the fields the handler actually reads.
function fakeRequest(hostname: string, user?: unknown) {
  return { hostname, user } as any;
}

beforeAll(() => {
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id';
  process.env.PLATFORM_BASE_URL = 'https://platform.test';
});

describe('CustomersAuthController#initiateGoogle returnUrl origin check', () => {
  it('accepts a returnUrl on the same host as the request', () => {
    const { controller, oauthState } = buildController();

    const result = controller.initiateGoogle(
      fakeRequest('shop.platform.test'),
      { returnUrl: 'https://shop.platform.test/auth/callback' },
    );

    expect(result.redirectUrl).toContain('state=signed-state');
    expect(oauthState.encode).toHaveBeenCalledWith(
      expect.objectContaining({
        returnUrl: 'https://shop.platform.test/auth/callback',
      }),
    );
  });

  it('accepts a same-host returnUrl on a different port (dev: web and api split)', () => {
    const { controller } = buildController();

    expect(() =>
      controller.initiateGoogle(fakeRequest('shop.localhost'), {
        returnUrl: 'http://shop.localhost:3001/auth/callback',
      }),
    ).not.toThrow();
  });

  it('rejects a cross-origin returnUrl', () => {
    const { controller, oauthState } = buildController();

    expect(() =>
      controller.initiateGoogle(fakeRequest('shop.platform.test'), {
        returnUrl: 'https://evil.example/steal',
      }),
    ).toThrow(BadRequestException);
    expect(oauthState.encode).not.toHaveBeenCalled();
  });

  it('rejects a returnUrl on a different tenant subdomain', () => {
    const { controller } = buildController();

    expect(() =>
      controller.initiateGoogle(fakeRequest('shop.platform.test'), {
        returnUrl: 'https://other-shop.platform.test/auth/callback',
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects a malformed returnUrl', () => {
    const { controller, oauthState } = buildController();

    expect(() =>
      controller.initiateGoogle(fakeRequest('shop.platform.test'), {
        returnUrl: 'not a url',
      }),
    ).toThrow(BadRequestException);
    expect(oauthState.encode).not.toHaveBeenCalled();
  });

  it('rejects a non-http(s) returnUrl scheme', () => {
    const { controller } = buildController();

    expect(() =>
      controller.initiateGoogle(fakeRequest('shop.platform.test'), {
        returnUrl: 'javascript:alert(1)',
      }),
    ).toThrow(BadRequestException);
  });
});

describe('CustomersAuthController#initiateGoogleLink returnUrl origin check', () => {
  // The link flow is authenticated, but the attacker authenticates as
  // themselves: a cross-origin returnUrl there still lets them drive a
  // victim's browser to a host they control after the Google round trip.
  it('accepts a same-host returnUrl', () => {
    const { controller } = buildController();

    expect(() =>
      controller.initiateGoogleLink(
        fakeRequest('shop.platform.test', {
          sub: 'cust-1',
          tenantId: 'tenant-1',
        }),
        { returnUrl: 'https://shop.platform.test/settings' },
      ),
    ).not.toThrow();
  });

  it('rejects a cross-origin returnUrl', () => {
    const { controller } = buildController();

    expect(() =>
      controller.initiateGoogleLink(
        fakeRequest('shop.platform.test', {
          sub: 'cust-1',
          tenantId: 'tenant-1',
        }),
        { returnUrl: 'https://evil.example/steal' },
      ),
    ).toThrow(BadRequestException);
  });
});
