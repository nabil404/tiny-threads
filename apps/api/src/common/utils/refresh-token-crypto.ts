import { createHash, randomBytes } from 'node:crypto';
import { AUTH_TOKEN_BYTE_LENGTH } from '../constants';

export function generateOpaqueToken(): string {
  return randomBytes(AUTH_TOKEN_BYTE_LENGTH).toString('base64url');
}

export function generateOpaqueRefreshToken(): string {
  return generateOpaqueToken();
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
