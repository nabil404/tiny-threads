import { GoogleOAuthController } from '../google-oauth.controller';

// GoogleOAuthController builds its own OAuth2Client from these env vars as a
// class field, evaluated at construction time — set to harmless dummy values
// so constructing the controller in tests never depends on real credentials.
process.env.GOOGLE_OAUTH_CLIENT_ID ??= 'test-client-id';
process.env.GOOGLE_OAUTH_CLIENT_SECRET ??= 'test-client-secret';
process.env.PLATFORM_BASE_URL ??= 'https://platform.example.com';

function buildController(
  stateOverrides: Partial<{
    population: 'customer' | 'merchant_admin';
    tenantId: string;
    returnUrl: string;
    intent: 'login' | 'link';
    linkCustomerId?: string;
  }> = {},
) {
  const state = {
    population: 'customer' as const,
    tenantId: 'tenant-1',
    returnUrl: 'https://shop.example.com/account',
    intent: 'login' as const,
    nonce: 'nonce-1',
    ...stateOverrides,
  };

  const callOrder: string[] = [];

  const oauthState = { decode: jest.fn().mockReturnValue(state) } as any;
  const customersAuthService = {
    findOrCreateFromGoogle: jest.fn().mockImplementation(() => {
      callOrder.push('findOrCreateFromGoogle');
      return Promise.resolve({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
    }),
    linkGoogleIdentity: jest.fn().mockImplementation(() => {
      callOrder.push('linkGoogleIdentity');
      return Promise.resolve(undefined);
    }),
  } as any;
  const oneTimeCodeService = {
    issue: jest.fn().mockReturnValue('one-time-code-123'),
  } as any;
  const cls = {
    set: jest.fn().mockImplementation((key: string) => {
      callOrder.push(`cls.set:${key}`);
    }),
  } as any;

  const controller = new GoogleOAuthController(
    oauthState,
    customersAuthService,
    oneTimeCodeService,
    cls,
  );
  // The Google API client is a real OAuth2Client instance created in a class
  // field — swap it for a stub so tests never make a real network call.
  (controller as any).client = {
    getToken: jest.fn().mockImplementation(() => {
      callOrder.push('client.getToken');
      return Promise.resolve({ tokens: { id_token: 'id-token-abc' } });
    }),
    verifyIdToken: jest.fn().mockResolvedValue({
      getPayload: () => ({
        sub: 'google-sub-1',
        email: 'jane@example.com',
        email_verified: true,
      }),
    }),
  };

  return {
    controller,
    oauthState,
    customersAuthService,
    oneTimeCodeService,
    cls,
    callOrder,
    state,
  };
}

describe('GoogleOAuthController#callback', () => {
  it('sets the decoded tenantId into CLS before calling into CustomersAuthService', async () => {
    const { controller, cls, customersAuthService, callOrder } =
      buildController();
    const res = { redirect: jest.fn() } as any;

    await controller.callback('auth-code', 'signed-state-token', res);

    // This is the regression this test exists for: TenantDbService.run()
    // reads the tenant EXCLUSIVELY from CLS and throws if unset. This route
    // is deliberately excluded from TenantResolutionMiddleware, so nothing
    // else populates CLS — the controller itself must, from the verified
    // state, before any DB-touching service call.
    expect(cls.set).toHaveBeenCalledWith('tenantId', 'tenant-1');
    expect(customersAuthService.findOrCreateFromGoogle).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' }),
    );
    expect(callOrder.indexOf('cls.set:tenantId')).toBeLessThan(
      callOrder.indexOf('findOrCreateFromGoogle'),
    );
  });

  it('sets tenantId into CLS before linkGoogleIdentity too', async () => {
    const { controller, cls, callOrder } = buildController({
      intent: 'link',
      linkCustomerId: 'cust-1',
    });
    const res = { redirect: jest.fn() } as any;

    await controller.callback('auth-code', 'signed-state-token', res);

    expect(cls.set).toHaveBeenCalledWith('tenantId', 'tenant-1');
    expect(callOrder.indexOf('cls.set:tenantId')).toBeLessThan(
      callOrder.indexOf('linkGoogleIdentity'),
    );
  });

  it('issues a tenant-bound one-time code and redirects with it, never the raw tokens', async () => {
    const { controller, oneTimeCodeService } = buildController();
    const res = { redirect: jest.fn() } as any;

    await controller.callback('auth-code', 'signed-state-token', res);

    expect(oneTimeCodeService.issue).toHaveBeenCalledWith({
      population: 'customer',
      tenantId: 'tenant-1',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    const redirectUrl = res.redirect.mock.calls[0][0] as string;
    expect(redirectUrl).toContain('code=one-time-code-123');
    expect(redirectUrl).not.toContain('access-token');
    expect(redirectUrl).not.toContain('refresh-token');
  });

  it('redirects with linkRequired=true and does not mint a code when auto-link is not allowed', async () => {
    const { controller, customersAuthService, oneTimeCodeService } =
      buildController();
    customersAuthService.findOrCreateFromGoogle.mockResolvedValue({
      linkRequired: true,
    });
    const res = { redirect: jest.fn() } as any;

    await controller.callback('auth-code', 'signed-state-token', res);

    expect(res.redirect).toHaveBeenCalledWith(
      expect.stringContaining('linkRequired=true'),
    );
    expect(oneTimeCodeService.issue).not.toHaveBeenCalled();
  });

  it('redirects with linked=true for the link flow, with no code or tokens', async () => {
    const { controller, oneTimeCodeService } = buildController({
      intent: 'link',
      linkCustomerId: 'cust-1',
    });
    const res = { redirect: jest.fn() } as any;

    await controller.callback('auth-code', 'signed-state-token', res);

    expect(res.redirect).toHaveBeenCalledWith(
      expect.stringContaining('linked=true'),
    );
    expect(oneTimeCodeService.issue).not.toHaveBeenCalled();
  });
});
