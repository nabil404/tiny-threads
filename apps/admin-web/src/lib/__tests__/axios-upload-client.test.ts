import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { refreshSession, toQueryError } from '../axios-upload-client';

vi.mock('axios');

describe('axios-upload-client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('refreshSession', () => {
    it('returns true when the refresh request succeeds', async () => {
      (axios.post as any).mockResolvedValue({ data: {} });
      const result = await refreshSession();
      expect(result).toBe(true);
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/merchant-admins/auth/refresh'),
        undefined,
        expect.objectContaining({ withCredentials: true }),
      );
    });

    it('returns false when the refresh request fails', async () => {
      (axios.post as any).mockRejectedValue(new Error('refresh failed'));
      const result = await refreshSession();
      expect(result).toBe(false);
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
      expect(result).toEqual({ status: 'FETCH_ERROR', data: undefined });
    });
  });
});
