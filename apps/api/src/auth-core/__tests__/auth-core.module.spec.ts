import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HashingService } from '../hashing.service';
import { TokenService } from '../token.service';
import { OAuthStateService } from '../oauth-state.service';
import { NOTIFICATIONS_PORT } from '../notifications/notifications-port';
import { AuthCoreModule } from '../auth-core.module';
import type { EnvironmentVariables } from '../../config/env.validation';

describe('AuthCoreModule', () => {
  const originalEnv = { ...process.env };

  beforeAll(() => {
    // JwtModule.registerAsync factory still reads process.env.JWT_SECRET directly (not yet migrated)
    process.env.JWT_SECRET = 'test-jwt-secret';
    // OAuthStateService now requires ConfigService via DI
    process.env.OAUTH_STATE_SECRET = 'test-oauth-state-secret';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('provides HashingService, TokenService, OAuthStateService, and NOTIFICATIONS_PORT', async () => {
    // Mock ConfigService for OAuthStateService (which now requires ConfigService via DI)
    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'OAUTH_STATE_SECRET') return process.env.OAUTH_STATE_SECRET;
        if (key === 'JWT_SECRET') return process.env.JWT_SECRET;
        return undefined;
      }),
    } as unknown as ConfigService<EnvironmentVariables, true>;

    const moduleRef = await Test.createTestingModule({
      imports: [AuthCoreModule],
    })
      .overrideProvider(OAuthStateService)
      .useValue(new OAuthStateService(mockConfigService))
      .compile();

    expect(moduleRef.get(HashingService)).toBeInstanceOf(HashingService);
    expect(moduleRef.get(TokenService)).toBeInstanceOf(TokenService);
    expect(moduleRef.get(OAuthStateService)).toBeInstanceOf(OAuthStateService);
    expect(moduleRef.get(NOTIFICATIONS_PORT)).toBeDefined();
  });
});
