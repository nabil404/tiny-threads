import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { HashingService } from '../services/hashing.service';
import { TokenService } from '../services/token.service';
import { OAuthStateService } from '../services/oauth-state.service';
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

  it('provides HashingService, TokenService, and OAuthStateService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        AuthCoreModule,
      ],
    }).compile();

    expect(moduleRef.get(HashingService)).toBeInstanceOf(HashingService);
    expect(moduleRef.get(TokenService)).toBeInstanceOf(TokenService);
    expect(moduleRef.get(OAuthStateService)).toBeInstanceOf(OAuthStateService);
  });
});
