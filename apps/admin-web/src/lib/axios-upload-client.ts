import axios, { AxiosError } from 'axios';
import { withSingleFlightRefresh } from './refresh-session-lock';

export const axiosUploadClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '',
  withCredentials: true,
});

export function refreshSession(): Promise<boolean> {
  // Routed through the shared single-flight lock so a batch of parallel
  // uploads that all 401 at once produces exactly one refresh request — the
  // backend treats concurrent use of the same refresh token as reuse and
  // revokes the whole token family.
  return withSingleFlightRefresh(async () => {
    try {
      await axiosUploadClient.post('/merchant-admins/auth/refresh', undefined, {
        withCredentials: true,
      });
      return true;
    } catch {
      return false;
    }
  });
}

export function toQueryError(err: unknown): {
  status: number | string;
  data?: unknown;
  error?: string;
} {
  const axiosErr = err as AxiosError;
  if (axiosErr.response) {
    return { status: axiosErr.response.status, data: axiosErr.response.data };
  }
  return {
    status: 'FETCH_ERROR',
    data: undefined,
    error: axiosErr.message ?? 'Network request failed',
  };
}
