import { describe, it, expect } from 'vitest';
import { baseApi } from '../baseApi';
import { store } from '../../index';

describe('baseApi and store configuration', () => {
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
});
