import type { ErrorResponseBody } from '@tiny-threads/shared';

export function extractErrorMessage(err: unknown, fallback: string): string {
  if (err === null || err === undefined) {
    return fallback;
  }
  const customErr = err as { data?: ErrorResponseBody; message?: string };
  return customErr.data?.error?.message ?? customErr.message ?? fallback;
}
