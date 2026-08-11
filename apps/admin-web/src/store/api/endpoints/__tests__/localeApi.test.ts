import { describe, it, expect } from 'vitest';
import { localeApi } from '../localeApi';

describe('localeApi endpoints', () => {
  it('injects the updateLocale mutation', () => {
    expect(localeApi.endpoints.updateLocale).toBeDefined();
    expect(typeof localeApi.endpoints.updateLocale.useMutation).toBe(
      'function',
    );
  });
});
