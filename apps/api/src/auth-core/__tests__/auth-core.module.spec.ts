import { Test } from '@nestjs/testing';
import { HashingService } from '../hashing.service';
import { TokenService } from '../token.service';
import { OAuthStateService } from '../oauth-state.service';
import { NOTIFICATIONS_PORT } from '../notifications/notifications-port';
import { AuthCoreModule } from '../auth-core.module';

describe('AuthCoreModule', () => {
  const originalEnv = { ...process.env };

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.OAUTH_STATE_SECRET = 'test-oauth-state-secret';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('provides HashingService, TokenService, OAuthStateService, and NOTIFICATIONS_PORT', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AuthCoreModule],
    }).compile();

    expect(moduleRef.get(HashingService)).toBeInstanceOf(HashingService);
    expect(moduleRef.get(TokenService)).toBeInstanceOf(TokenService);
    expect(moduleRef.get(OAuthStateService)).toBeInstanceOf(OAuthStateService);
    expect(moduleRef.get(NOTIFICATIONS_PORT)).toBeDefined();
  });
});
