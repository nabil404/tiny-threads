import { describe, it, expect, vi, afterEach } from 'vitest';
import { login, getLocale, updateLocale } from '../api-client';

function mockFetchOnce(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

describe('api-client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('login', () => {
    it('posts email and password and resolves the accessToken', async () => {
      const fetchMock = mockFetchOnce(200, { accessToken: 'jwt-abc' });
      vi.stubGlobal('fetch', fetchMock);

      const result = await login('owner@acme.dev', 'hunter2');

      expect(result).toEqual({ accessToken: 'jwt-abc' });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toContain('/merchant-admins/auth/login');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({
        email: 'owner@acme.dev',
        password: 'hunter2',
      });
      expect(init.credentials).toBe('include');
    });
  });

  describe('getLocale', () => {
    it('attaches the Authorization header and returns the locale', async () => {
      const fetchMock = mockFetchOnce(200, { locale: 'en' });
      vi.stubGlobal('fetch', fetchMock);

      const result = await getLocale('jwt-abc');

      expect(result).toEqual({ locale: 'en' });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toContain('/merchant-admins/me/locale');
      expect(init.headers.Authorization).toBe('Bearer jwt-abc');
    });
  });

  describe('updateLocale', () => {
    it('sends a PATCH with the new locale and the Authorization header', async () => {
      const fetchMock = mockFetchOnce(200, { locale: 'en' });
      vi.stubGlobal('fetch', fetchMock);

      const result = await updateLocale('jwt-abc', 'en');

      expect(result).toEqual({ locale: 'en' });
      const [, init] = fetchMock.mock.calls[0];
      expect(init.method).toBe('PATCH');
      expect(init.headers.Authorization).toBe('Bearer jwt-abc');
      expect(JSON.parse(init.body)).toEqual({ locale: 'en' });
    });
  });

  describe('error handling', () => {
    it('throws ApiClientError populated from the coded error envelope', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetchOnce(400, {
          error: { code: 'IS_IN', message: 'locale must be one of: en', params: { values: 'en' } },
        }),
      );

      await expect(getLocale('jwt-abc')).rejects.toMatchObject({
        status: 400,
        code: 'IS_IN',
        message: 'locale must be one of: en',
      });
    });

    it('falls back to an HTTP_<status> code when the response body is not JSON', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: () => Promise.reject(new Error('not json')),
        }),
      );

      await expect(getLocale('jwt-abc')).rejects.toMatchObject({
        status: 500,
        code: 'HTTP_500',
      });
    });
  });
});
