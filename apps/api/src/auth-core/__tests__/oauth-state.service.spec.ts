import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuthStateService } from '../services/oauth-state.service';
import type { EnvironmentVariables } from '../../config/env.validation';

function buildService(secret = 'test-oauth-state-secret') {
  const configService = {
    get: jest.fn().mockReturnValue(secret),
  } as unknown as ConfigService<EnvironmentVariables, true>;
  return new OAuthStateService(configService);
}

describe('OAuthStateService', () => {
  it('round-trips a state payload', () => {
    const service = buildService();
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
    const service = buildService();
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
