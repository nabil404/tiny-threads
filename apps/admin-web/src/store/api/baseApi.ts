import {
  createApi,
  fetchBaseQuery,
  BaseQueryFn,
  FetchArgs,
  FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import type { RootState } from '../index';

const rawBaseQuery = fetchBaseQuery({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  credentials: 'include',
});

export const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  let result = await rawBaseQuery(args, api, extraOptions);

  const url = typeof args === 'string' ? args : args.url;
  const isAuthEndpoint =
    url.includes('/merchant-admins/auth/login') ||
    url.includes('/merchant-admins/auth/refresh');

  if (result.error && result.error.status === 401 && !isAuthEndpoint) {
    const refreshResult = await rawBaseQuery(
      {
        url: '/merchant-admins/auth/refresh',
        method: 'POST',
      },
      api,
      extraOptions,
    );

    if (refreshResult.data) {
      // Cookies are automatically updated by the response; retry the original query
      result = await rawBaseQuery(args, api, extraOptions);
    } else {
      // Dispatched as a plain action (rather than importing the `logout`
      // action creator, or authSlice's `selectAuth`) to avoid a module
      // import cycle: authSlice imports authApi, which imports this
      // file, so this file must not import back from authSlice. The
      // action type must stay in sync with authSlice's `name: 'auth'`
      // slice and `logout` reducer key; the field read below must stay
      // in sync with `AuthState.isAuthenticated`.
      const wasAuthenticated = (api.getState() as RootState).auth
        .isAuthenticated;
      api.dispatch({ type: 'auth/logout' });

      // Only reset the RTK Query cache on the transition from
      // authenticated -> logged out, not on every subsequent 401 while
      // already logged out. `resetApiState()` makes every mounted query
      // (e.g. RequireAuth's/PublicOnlyRoute's `getMe` subscription)
      // immediately refetch — that's exactly what we want once, to
      // clear a stale *fulfilled* `getMe` result that a DIFFERENT
      // endpoint's auth failure wouldn't otherwise invalidate. But
      // resetting on every failure turns a fully-expired session into
      // an unbounded loop: reset -> refetch -> 401 -> refresh fails ->
      // reset -> refetch -> ..., since every route is guarded by a
      // getMe-subscribing component. Gating on the transition means the
      // reset fires once per session death; every failure after that
      // (while already logged out) just lets the query resolve to its
      // own natural rejected state, which the guards already handle
      // correctly via `isError`.
      if (wasAuthenticated) {
        // Deferred to a macrotask: this base query is itself in the
        // middle of resolving the very query whose cache entry is about
        // to be wiped. Resetting synchronously here races that
        // in-flight query's own rejection handling — a still-mounted
        // subscriber sees the cache flip back to "uninitialized" and
        // immediately re-fires the query before this request's own
        // rejection lands. Deferring lets the current request finish
        // updating its own cache entry first.
        setTimeout(() => {
          api.dispatch(baseApi.util.resetApiState());
        }, 0);
      }
    }
  }

  return result;
};

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Auth', 'Locale', 'Products', 'Orders', 'Settings'],
  endpoints: () => ({}),
});
