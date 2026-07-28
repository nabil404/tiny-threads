import { BadRequestException } from '@nestjs/common';
import { MerchantAdminsAuthController } from '../merchant-admins-auth.controller';

// Mirrors customers-auth.controller.oauth-initiate.spec.ts — regression
// coverage for final-review finding C1 (unauthenticated open redirect on the
// OAuth initiate endpoint leaking one-time codes to an attacker-chosen host).
function buildController() {
  const merchantAdminsAuthService = {} as any;
  const cls = { get: jest.fn().mockReturnValue('tenant-1') } as any;
  const oauthState = {
    encode: jest.fn().mockReturnValue('signed-state'),
  } as any;
  const oneTimeCodeService = {} as any;

  const controller = new MerchantAdminsAuthController(
    merchantAdminsAuthService,
    cls,
    oauthState,
    oneTimeCodeService,
  );

  return { controller, oauthState };
}

function fakeRequest(hostname: string) {
  return { hostname } as any;
}

beforeAll(() => {
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id';
  process.env.PLATFORM_BASE_URL = 'https://platform.test';
});

describe('MerchantAdminsAuthController#initiateGoogle returnUrl origin check', () => {
  it('accepts a returnUrl on the same host as the request', () => {
    const { controller, oauthState } = buildController();

    const result = controller.initiateGoogle(
      fakeRequest('shop.platform.test'),
      {
        returnUrl: 'https://shop.platform.test/admin/callback',
      },
    );

    expect(result.redirectUrl).toContain('state=signed-state');
    expect(oauthState.encode).toHaveBeenCalledWith(
      expect.objectContaining({
        population: 'merchant_admin',
        returnUrl: 'https://shop.platform.test/admin/callback',
      }),
    );
  });

  it('accepts a same-host returnUrl on a different port (dev: web and api split)', () => {
    const { controller } = buildController();

    expect(() =>
      controller.initiateGoogle(fakeRequest('shop.localhost'), {
        returnUrl: 'http://shop.localhost:3001/admin/callback',
      }),
    ).not.toThrow();
  });

  // See the customer equivalent: Host is case-insensitive, URL.hostname is
  // already lowercased, so an unnormalized comparison rejects a legitimate
  // same-origin request.
  it('accepts a same-host returnUrl when the Host header is uppercase', () => {
    const { controller } = buildController();

    expect(() =>
      controller.initiateGoogle(fakeRequest('SHOP.PLATFORM.TEST'), {
        returnUrl: 'https://shop.platform.test/admin/callback',
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
        returnUrl: 'https://other-shop.platform.test/admin/callback',
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
