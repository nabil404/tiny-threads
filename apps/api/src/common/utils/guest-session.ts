import { isUUID } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import { CodedBadRequestException } from '../errors/coded-exceptions';

// The session id is an attacker-controlled header that ends up as a cart
// lookup key, so it's constrained to the UUID shape we hand out ourselves.
// A blank header is treated as absent rather than rejected.
export function resolveGuestSessionId(
  raw: string | undefined,
): string | undefined {
  const sessionId = raw?.trim();
  if (!sessionId) {
    return undefined;
  }
  if (!isUUID(sessionId)) {
    throw new CodedBadRequestException(
      ErrorCode.VALIDATION_FAILED,
      'x-guest-session-id must be a valid UUID',
    );
  }
  return sessionId;
}
