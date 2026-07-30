import { MerchantAdminJwtAuthGuard } from '../guards/merchant-admin-jwt-auth.guard';

describe('MerchantAdminJwtAuthGuard', () => {
  it('throws a coded AUTH_INVALID_ACCESS_TOKEN error when passport reports an error', () => {
    const guard = new MerchantAdminJwtAuthGuard();
    let caught: unknown;
    try {
      guard.handleRequest(new Error('jwt expired'), null);
    } catch (error) {
      caught = error;
    }
    expect((caught as { getResponse: () => unknown }).getResponse()).toEqual({
      code: 'AUTH_INVALID_ACCESS_TOKEN',
      message: 'Invalid or expired access token',
      params: {},
    });
  });

  it('throws the same coded error when there is no user and no explicit error', () => {
    const guard = new MerchantAdminJwtAuthGuard();
    let caught: unknown;
    try {
      guard.handleRequest(null, null);
    } catch (error) {
      caught = error;
    }
    expect((caught as { getResponse: () => unknown }).getResponse()).toEqual({
      code: 'AUTH_INVALID_ACCESS_TOKEN',
      message: 'Invalid or expired access token',
      params: {},
    });
  });

  it('returns the user when authentication succeeds', () => {
    const guard = new MerchantAdminJwtAuthGuard();
    const user = { sub: 'merchant-admin-1' };
    expect(guard.handleRequest(null, user)).toBe(user);
  });
});
