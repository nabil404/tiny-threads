import { randomUUID } from 'crypto';
import { resolveGuestSessionId } from '../guest-session';
import { CodedBadRequestException } from '../../errors/coded-exceptions';

describe('resolveGuestSessionId', () => {
  it('returns undefined for an absent header', () => {
    expect(resolveGuestSessionId(undefined)).toBeUndefined();
  });

  it('returns undefined for a blank/whitespace-only header', () => {
    expect(resolveGuestSessionId('   ')).toBeUndefined();
  });

  it('trims and returns a valid UUID', () => {
    const id = randomUUID();
    expect(resolveGuestSessionId(`  ${id}  `)).toBe(id);
  });

  it('rejects a non-UUID value', () => {
    expect(() => resolveGuestSessionId('not-a-uuid')).toThrow(
      CodedBadRequestException,
    );
  });
});
