import { JwtService } from '@nestjs/jwt';
import { TokenService } from '../token.service';

describe('TokenService', () => {
  const jwtService = new JwtService({ secret: 'test-secret' });
  const service = new TokenService(jwtService);

  it('round-trips a customer access token', () => {
    const token = service.signAccessToken({ sub: 'cust-1', aud: 'customer', tenantId: 'tenant-1' });
    const payload = service.verifyAccessToken(token);
    expect(payload).toMatchObject({ sub: 'cust-1', aud: 'customer', tenantId: 'tenant-1' });
  });

  it('round-trips a merchant admin access token with a role claim', () => {
    const token = service.signAccessToken({
      sub: 'mu-1',
      aud: 'merchant_admin',
      tenantId: 'tenant-1',
      role: 'owner',
    });
    const payload = service.verifyAccessToken(token);
    expect(payload).toMatchObject({ sub: 'mu-1', aud: 'merchant_admin', tenantId: 'tenant-1', role: 'owner' });
  });

  it('throws on a tampered token', () => {
    const token = service.signAccessToken({ sub: 'cust-1', aud: 'customer', tenantId: 'tenant-1' });
    expect(() => service.verifyAccessToken(token + 'x')).toThrow();
  });
});
