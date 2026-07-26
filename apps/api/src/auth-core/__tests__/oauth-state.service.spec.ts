import { BadRequestException } from '@nestjs/common';
import { OAuthStateService } from '../oauth-state.service';

describe('OAuthStateService', () => {
  const originalSecret = process.env.OAUTH_STATE_SECRET;

  beforeAll(() => {
    process.env.OAUTH_STATE_SECRET = 'test-oauth-state-secret';
  });

  afterAll(() => {
    process.env.OAUTH_STATE_SECRET = originalSecret;
  });

  it('round-trips a state payload', () => {
    const service = new OAuthStateService();
    const token = service.encode({
      population: 'customer',
      tenantId: 'tenant-1',
      returnUrl: 'https://shop.platform.com/account',
      intent: 'login',
    });
    const decoded = service.decode(token);
    expect(decoded).toMatchObject({
      population: 'customer',
      tenantId: 'tenant-1',
      returnUrl: 'https://shop.platform.com/account',
      intent: 'login',
    });
    expect(typeof decoded.nonce).toBe('string');
  });

  it('rejects a tampered state token', () => {
    const service = new OAuthStateService();
    const token = service.encode({
      population: 'merchant_admin',
      tenantId: 'tenant-1',
      returnUrl: 'https://shop.platform.com/admin',
      intent: 'login',
    });
    const [payload] = token.split('.');
    const tampered = `${payload}.deadbeef`;
    expect(() => service.decode(tampered)).toThrow(BadRequestException);
  });
});
