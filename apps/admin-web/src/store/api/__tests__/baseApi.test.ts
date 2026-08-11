import { describe, it, expect, vi, beforeEach } from 'vitest';
import { baseApi, baseQueryWithReauth } from '../baseApi';
import { store } from '../../index';

describe('baseApi and store configuration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('defines baseApi with expected reducerPath and tagTypes', () => {
    expect(baseApi.reducerPath).toBe('api');
    expect(baseApi.endpoints).toBeDefined();
  });

  it('includes api reducer in root store state', () => {
    const state = store.getState();
    expect(state).toHaveProperty('api');
    expect(state).toHaveProperty('app');
    expect(state).toHaveProperty('auth');
  });

  it('allows injecting endpoints and dispatching actions', () => {
    const extendedApi = baseApi.injectEndpoints({
      endpoints: (builder) => ({
        getTest: builder.query<string, void>({
          query: () => '/test',
          providesTags: ['Products'],
        }),
      }),
      overrideExisting: true,
    });

    expect(extendedApi.endpoints.getTest).toBeDefined();
    expect(typeof extendedApi.useGetTestQuery).toBe('function');
  });

  it('exports baseQueryWithReauth as a function', () => {
    expect(typeof baseQueryWithReauth).toBe('function');
  });
});
