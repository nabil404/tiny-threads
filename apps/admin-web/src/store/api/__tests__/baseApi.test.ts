import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { render, cleanup, waitFor } from '@testing-library/react';
import { baseApi, baseQueryWithReauth } from '../baseApi';
import { store } from '../../index';
import authReducer, { type AuthState } from '../../slices/authSlice';
import { authApi, useGetMeQuery } from '../endpoints/authApi';
import { localeApi } from '../endpoints/localeApi';

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

describe('baseQueryWithReauth session-death handling', () => {
  const getMePayload = {
    user: {
      id: 'user-1',
      email: 'admin@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      role: 'MERCHANT_ADMIN',
      locale: 'en',
    },
    tenant: { id: 'tenant-1', name: 'Tiny Threads Demo' },
  };

  const jsonResponse = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  const unauthorized = () =>
    jsonResponse(
      { error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
      401,
    );

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });

  /**
   * A store isolated from the app singleton so the assertions below are
   * hermetic: the singleton is shared with (and mutated by) every other
   * test in this suite.
   */
  const makeTestStore = (auth: Partial<AuthState> = {}) =>
    configureStore({
      reducer: {
        auth: authReducer,
        [baseApi.reducerPath]: baseApi.reducer,
      },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().concat(baseApi.middleware),
      preloadedState: {
        auth: {
          user: null,
          tenant: null,
          isAuthenticated: false,
          ...auth,
        } satisfies AuthState,
      },
    });

  const authenticatedState: Partial<AuthState> = {
    user: {
      id: getMePayload.user.id,
      email: getMePayload.user.email,
      firstName: getMePayload.user.firstName,
      lastName: getMePayload.user.lastName,
      role: getMePayload.user.role,
    },
    tenant: getMePayload.tenant,
    isAuthenticated: true,
  };

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('stops refetching once a fully-expired session has been observed', async () => {
    // Every request (including the silent refresh) fails: both the access
    // and the refresh token have expired.
    const fetchMock = vi.fn(async () => unauthorized());
    vi.stubGlobal('fetch', fetchMock);

    const testStore = makeTestStore(authenticatedState);

    // Stand in for RequireAuth / PublicOnlyRoute: every route in the app is
    // wrapped in a component that subscribes to `getMe` unconditionally, so
    // a cache reset always triggers an immediate refetch.
    function GetMeSubscriber() {
      useGetMeQuery();
      return null;
    }

    render(
      createElement(Provider, {
        store: testStore,
        children: createElement(GetMeSubscriber),
      }),
    );

    // The failed refresh logs the session out.
    await waitFor(() => {
      expect(testStore.getState().auth.isAuthenticated).toBe(false);
    });

    await sleep(250);
    const callsAfterSettling = fetchMock.mock.calls.length;
    await sleep(250);
    const callsAfterWaitingLonger = fetchMock.mock.calls.length;

    // Before the transition guard, resetApiState() fired on *every* failed
    // refresh, so the mounted subscriber refetched -> 401 -> refresh fails
    // -> reset -> refetch ... without bound. The request count must plateau.
    expect(callsAfterWaitingLonger).toBe(callsAfterSettling);

    // Concretely: getMe + refresh, then one reset-driven getMe + refresh.
    expect(callsAfterSettling).toBeLessThanOrEqual(6);

    const requestedUrls = fetchMock.mock.calls.map((call) =>
      String((call as unknown as [RequestInfo])[0]),
    );
    expect(
      requestedUrls.filter((url) => url.includes('/merchant-admins/auth/me'))
        .length,
    ).toBeLessThanOrEqual(3);
  });

  it('invalidates a stale fulfilled getMe cache entry when another endpoint hits an unrecoverable 401', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(getMePayload, 200));
    vi.stubGlobal('fetch', fetchMock);

    const testStore = makeTestStore();

    // Earlier successful login: getMe resolves and is cached as fulfilled.
    const getMeSubscription = testStore.dispatch(
      authApi.endpoints.getMe.initiate(),
    );
    await getMeSubscription;

    expect(testStore.getState().auth.isAuthenticated).toBe(true);
    expect(authApi.endpoints.getMe.select()(testStore.getState()).data).toEqual(
      getMePayload,
    );

    // The session dies while the fulfilled getMe entry is still cached.
    fetchMock.mockImplementation(async () => unauthorized());

    // A DIFFERENT endpoint hits the 401. Its `invalidatesTags: ['Locale']`
    // does not touch the 'Auth' tag, so nothing but the cache reset can
    // clear the stale getMe entry the guards read.
    await testStore.dispatch(
      localeApi.endpoints.updateLocale.initiate({ locale: 'bn' }),
    );

    expect(testStore.getState().auth.isAuthenticated).toBe(false);

    await waitFor(() => {
      const staleEntry = authApi.endpoints.getMe.select()(testStore.getState());
      expect(staleEntry.data).toBeUndefined();
      expect(staleEntry.isSuccess).toBe(false);
    });

    getMeSubscription.unsubscribe();
  });
});
