import { describe, it, expect } from 'vitest';
import { localeApi } from '../localeApi';

describe('localeApi endpoints', () => {
  it('injects getLocale and updateLocale endpoints', () => {
    expect(localeApi.endpoints.getLocale).toBeDefined();
    expect(typeof localeApi.endpoints.getLocale.useQuery).toBe('function');
    expect(localeApi.endpoints.updateLocale).toBeDefined();
    expect(typeof localeApi.endpoints.updateLocale.useMutation).toBe('function');
  });
});
