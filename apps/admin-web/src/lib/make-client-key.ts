let counter = 0;

/**
 * Session-unique key for client-side list identity (e.g. react-hook-form field
 * array keys). `crypto.randomUUID` is only defined in a secure context, so a
 * plain-HTTP host (LAN IP during dev, HTTP-only deployment) would throw a
 * TypeError mid-render; these keys need uniqueness, not cryptographic
 * randomness, so a counter + timestamp fallback is sufficient.
 */
export function makeClientKey(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  counter += 1;
  return `client-${Date.now()}-${counter}-${Math.random().toString(36).slice(2)}`;
}
