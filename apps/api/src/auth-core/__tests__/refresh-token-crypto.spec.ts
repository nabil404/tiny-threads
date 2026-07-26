import { generateOpaqueRefreshToken, hashRefreshToken } from '../refresh-token-crypto';

describe('refresh token crypto', () => {
  it('generates distinct high-entropy opaque tokens', () => {
    const a = generateOpaqueRefreshToken();
    const b = generateOpaqueRefreshToken();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });

  it('hashes deterministically for the same input', () => {
    const token = 'fixed-token-value';
    expect(hashRefreshToken(token)).toEqual(hashRefreshToken(token));
  });

  it('never returns the raw token as the hash', () => {
    const token = generateOpaqueRefreshToken();
    expect(hashRefreshToken(token)).not.toEqual(token);
  });
});
