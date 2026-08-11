import { describe, it, expect } from 'vitest';
import { extractErrorMessage } from '../extract-error-message';

describe('extractErrorMessage', () => {
  it('returns the coded API error message when present', () => {
    const err = {
      data: { error: { code: 'AUTH_INVALID_CREDENTIALS', message: 'Coded failure' } },
    };
    expect(extractErrorMessage(err, 'fallback')).toBe('Coded failure');
  });

  it('falls back to err.message when there is no coded error body', () => {
    const err = { message: 'Network error' };
    expect(extractErrorMessage(err, 'fallback')).toBe('Network error');
  });

  it('falls back to the provided default when neither is present', () => {
    expect(extractErrorMessage({}, 'fallback')).toBe('fallback');
    expect(extractErrorMessage(null, 'fallback')).toBe('fallback');
  });
});
