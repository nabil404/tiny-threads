import { describe, it, expect } from 'vitest';
import { authApi } from '../authApi';

describe('authApi endpoints', () => {
  it('injects getMe query, and login, refresh, and logout endpoint mutations', () => {
    expect(authApi.endpoints.getMe).toBeDefined();
    expect(typeof authApi.endpoints.getMe.useQuery).toBe('function');

    expect(authApi.endpoints.login).toBeDefined();
    expect(typeof authApi.endpoints.login.useMutation).toBe('function');

    expect(authApi.endpoints.refresh).toBeDefined();
    expect(typeof authApi.endpoints.refresh.useMutation).toBe('function');

    expect(authApi.endpoints.logout).toBeDefined();
    expect(typeof authApi.endpoints.logout.useMutation).toBe('function');
  });
});
