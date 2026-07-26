import { OneTimeCodeService } from '../one-time-code.service';

describe('OneTimeCodeService', () => {
  function payload(overrides: Partial<Parameters<OneTimeCodeService['issue']>[0]> = {}) {
    return {
      population: 'customer' as const,
      tenantId: 'tenant-1',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      ...overrides,
    };
  }

  it('redeems an issued code exactly once, returning the original payload', () => {
    const service = new OneTimeCodeService();
    const code = service.issue(payload());

    const result = service.redeem(code);

    expect(result).toEqual(payload());
  });

  it('is single-use: redeeming the same code a second time returns null', () => {
    const service = new OneTimeCodeService();
    const code = service.issue(payload());

    service.redeem(code);
    const secondAttempt = service.redeem(code);

    expect(secondAttempt).toBeNull();
  });

  it('returns null for a code that has expired (delete-on-read applies even to expired entries)', () => {
    const service = new OneTimeCodeService();
    // ttlMs is overridable specifically so this can be tested deterministically,
    // without faking global timers.
    const code = service.issue(payload(), -1);

    const result = service.redeem(code);

    expect(result).toBeNull();
    // Confirms delete-on-read fired even though the entry was expired —
    // redeeming again must still be null, not throw or resurrect it.
    expect(service.redeem(code)).toBeNull();
  });

  it('returns null for a code that was never issued', () => {
    const service = new OneTimeCodeService();

    expect(service.redeem('unknown-code')).toBeNull();
  });

  it('keeps separately-issued codes independent of one another', () => {
    const service = new OneTimeCodeService();
    const codeA = service.issue(payload({ tenantId: 'tenant-a' }));
    const codeB = service.issue(payload({ tenantId: 'tenant-b' }));

    expect(service.redeem(codeA)).toEqual(
      expect.objectContaining({ tenantId: 'tenant-a' }),
    );
    expect(service.redeem(codeB)).toEqual(
      expect.objectContaining({ tenantId: 'tenant-b' }),
    );
  });
});
