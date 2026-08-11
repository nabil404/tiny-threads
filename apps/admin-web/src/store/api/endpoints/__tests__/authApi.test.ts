import { describe, it, expect } from 'vitest';
import { authApi } from '../authApi';

describe('authApi endpoints', () => {
  it('injects login endpoint mutation', () => {
    expect(authApi.endpoints.login).toBeDefined();
    expect(typeof authApi.endpoints.login.useMutation).toBe('function');
  });
});
