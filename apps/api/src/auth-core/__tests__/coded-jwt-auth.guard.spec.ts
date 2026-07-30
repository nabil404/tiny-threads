import { ErrorCode } from '@tiny-threads/shared';
import { CodedUnauthorizedException } from '../../common/errors/coded-exceptions';
import { createCodedJwtAuthGuard } from '../guards/coded-jwt-auth.guard';

describe('createCodedJwtAuthGuard', () => {
  const Guard = createCodedJwtAuthGuard('test-jwt');

  it('throws AUTH_INVALID_ACCESS_TOKEN when there is no user and no explicit error (missing/expired token)', () => {
    const guard = new Guard();
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

  it('rethrows a specific coded error from the strategy unchanged (e.g. wrong audience or tenant mismatch)', () => {
    const guard = new Guard();
    const strategyError = new CodedUnauthorizedException(
      ErrorCode.AUTH_TOKEN_TENANT_MISMATCH,
      'Token tenant mismatch',
    );
    expect(() => {
      guard.handleRequest(strategyError, null);
    }).toThrow(strategyError);
  });

  it('rethrows an unexpected error from the strategy unchanged, rather than masking it as a 401', () => {
    const guard = new Guard();
    const unexpected = new Error('database exploded');
    expect(() => {
      guard.handleRequest(unexpected, null);
    }).toThrow(unexpected);
  });

  it('returns the user when authentication succeeds', () => {
    const guard = new Guard();
    const user = { sub: 'user-1' };
    expect(guard.handleRequest(null, user)).toBe(user);
  });
});
