import type { ErrorResponseBody } from '@tiny-threads/shared';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly params: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  { token, ...init }: RequestInit & { token?: string } = {},
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (!res.ok) {
    const body = (await res
      .json()
      .catch(() => null)) as ErrorResponseBody | null;
    const err = body?.error;
    throw new ApiClientError(
      res.status,
      err?.code ?? `HTTP_${res.status}`,
      err?.message ?? res.statusText,
      err?.params ?? {},
    );
  }
  return res.status === 204 ? (undefined as T) : (res.json() as Promise<T>);
}

export function login(email: string, password: string) {
  return request<{ accessToken: string }>('/merchant-admins/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function getLocale(token: string) {
  return request<{ locale: string | null }>('/merchant-admins/me/locale', {
    token,
  });
}

export function updateLocale(token: string, locale: string | null) {
  return request<{ locale: string | null }>('/merchant-admins/me/locale', {
    method: 'PATCH',
    token,
    body: JSON.stringify({ locale }),
  });
}
