import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HashingService } from '../hashing.service';
import { TokenService } from '../token.service';
import { OAuthStateService } from '../oauth-state.service';
import { NOTIFICATIONS_PORT } from '../notifications/notifications-port';
import { AuthCoreModule } from '../auth-core.module';
import type { EnvironmentVariables } from '../../config/env.validation';

describe('AuthCoreModule', () => {
  it('provides HashingService, TokenService, OAuthStateService, and NOTIFICATIONS_PORT', async () => {
    const configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'OAUTH_STATE_SECRET') return 'test-oauth-state-secret';
        if (key === 'JWT_SECRET') return 'test-jwt-secret';
        return undefined;
      }),
    } as unknown as ConfigService<EnvironmentVariables, true>;

    const moduleRef = await Test.createTestingModule({
      imports: [AuthCoreModule],
    })
      .overrideProvider(ConfigService)
      .useValue(configService)
      .compile();

    expect(moduleRef.get(HashingService)).toBeInstanceOf(HashingService);
    expect(moduleRef.get(TokenService)).toBeInstanceOf(TokenService);
    expect(moduleRef.get(OAuthStateService)).toBeInstanceOf(OAuthStateService);
    expect(moduleRef.get(NOTIFICATIONS_PORT)).toBeDefined();
  });
});
