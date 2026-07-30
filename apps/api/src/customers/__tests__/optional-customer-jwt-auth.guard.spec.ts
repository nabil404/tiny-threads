import { OptionalCustomerJwtAuthGuard } from '../guards/optional-customer-jwt-auth.guard';

describe('OptionalCustomerJwtAuthGuard', () => {
  it('returns the user when authentication succeeds', () => {
    const guard = new OptionalCustomerJwtAuthGuard();
    const user = { id: 'customer-1' };
    expect(guard.handleRequest(null, user)).toBe(user);
  });

  it('returns undefined instead of throwing when there is no user (missing/expired token)', () => {
    const guard = new OptionalCustomerJwtAuthGuard();
    expect(() => guard.handleRequest(null, undefined)).not.toThrow();
    expect(guard.handleRequest(null, undefined)).toBeUndefined();
  });

  it('returns null instead of throwing when the strategy reports an error', () => {
    const guard = new OptionalCustomerJwtAuthGuard();
    const strategyError = new Error('token verification exploded');
    expect(() => guard.handleRequest(strategyError, null)).not.toThrow();
    expect(guard.handleRequest(strategyError, null)).toBeNull();
  });
});
