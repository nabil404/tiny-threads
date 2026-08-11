export interface MerchantJwtPayload {
  sub: string;
  aud: string;
  tenantId: string;
  role: string;
  exp?: number;
  iat?: number;
}

export function parseJwtPayload<T = MerchantJwtPayload>(
  token: string,
): T | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    return JSON.parse(jsonPayload) as T;
  } catch {
    return null;
  }
}
