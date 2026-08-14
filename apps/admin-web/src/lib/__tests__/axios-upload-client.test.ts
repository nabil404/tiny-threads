import { describe, it, expect, vi, beforeEach } from 'vitest';
import { refreshSession, toQueryError } from '../axios-upload-client';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));

vi.mock('axios', () => ({
  default: { create: () => ({ post: postMock }) },
  AxiosError: class AxiosError extends Error {},
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('axios-upload-client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('refreshSession', () => {
    it('returns true when the refresh request succeeds', async () => {
      postMock.mockResolvedValue({ data: {} });
      const result = await refreshSession();
      expect(result).toBe(true);
      expect(postMock).toHaveBeenCalledWith(
        '/merchant-admins/auth/refresh',
        undefined,
        expect.objectContaining({ withCredentials: true }),
      );
    });

    it('returns false when the refresh request fails', async () => {
      postMock.mockRejectedValue(new Error('refresh failed'));
      const result = await refreshSession();
      expect(result).toBe(false);
    });

    it('coalesces concurrent calls into a single refresh request', async () => {
      const d = deferred<{ data: unknown }>();
      postMock.mockReturnValue(d.promise);

      const first = refreshSession();
      const second = refreshSession();

      expect(postMock).toHaveBeenCalledTimes(1);

      d.resolve({ data: {} });
      expect(await first).toBe(true);
      expect(await second).toBe(true);
      expect(postMock).toHaveBeenCalledTimes(1);
    });

    it('allows a new refresh request once the in-flight one has settled', async () => {
      postMock.mockResolvedValue({ data: {} });
      await refreshSession();
      await refreshSession();
      expect(postMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('toQueryError', () => {
    it('maps an axios error response into a FetchBaseQueryError shape', () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 400,
          data: { error: { code: 'FILE_TOO_LARGE', message: 'Too large' } },
        },
      };
      const result = toQueryError(axiosError);
      expect(result).toEqual({
        status: 400,
        data: { error: { code: 'FILE_TOO_LARGE', message: 'Too large' } },
      });
    });

    it('falls back to FETCH_ERROR when there is no response (e.g. network failure)', () => {
      const axiosError = { isAxiosError: true, message: 'Network Error' };
      const result = toQueryError(axiosError);
      expect(result).toEqual({
        status: 'FETCH_ERROR',
        data: undefined,
        error: 'Network Error',
      });
    });

    it('supplies a default message when the network error has none', () => {
      const result = toQueryError({ isAxiosError: true });
      expect(result).toEqual({
        status: 'FETCH_ERROR',
        data: undefined,
        error: 'Network request failed',
      });
    });
  });
});
