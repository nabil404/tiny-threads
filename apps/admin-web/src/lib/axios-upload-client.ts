import axios, { AxiosError } from 'axios';

export const axiosUploadClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '',
  withCredentials: true,
});

export async function refreshSession(): Promise<boolean> {
  try {
    await axios.post(
      `${import.meta.env.VITE_API_BASE_URL ?? ''}/merchant-admins/auth/refresh`,
      undefined,
      { withCredentials: true },
    );
    return true;
  } catch {
    return false;
  }
}

export function toQueryError(err: unknown): {
  status: number | string;
  data?: unknown;
} {
  const axiosErr = err as AxiosError;
  if (axiosErr.response) {
    return { status: axiosErr.response.status, data: axiosErr.response.data };
  }
  return { status: 'FETCH_ERROR', data: undefined };
}
