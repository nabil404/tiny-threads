import {
  createApi,
  fetchBaseQuery,
  BaseQueryFn,
  FetchArgs,
  FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';

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
      // action creator) to avoid a module import cycle: authSlice imports
      // authApi, which imports this file, so this file must not import
      // back from authSlice. The action type must stay in sync with
      // authSlice's `name: 'auth'` slice and `logout` reducer key.
      api.dispatch({ type: 'auth/logout' });
      // Clear the entire RTK Query cache (including the now-stale `getMe`
      // fulfilled result) so `RequireAuth`, which gates purely on the
      // `getMe` cache, stops treating this session as authenticated.
      //
      // Deferred to a macrotask: this base query is itself in the middle
      // of resolving the very query whose cache entry is about to be
      // wiped. Resetting synchronously here races that in-flight query's
      // own rejection handling — the reducer has no entry left to write
      // the rejected result into, and a still-mounted subscriber (e.g.
      // `RequireAuth`) sees the cache flip back to "uninitialized" and
      // immediately re-fires the query, causing a refetch loop. Deferring
      // lets the current request finish updating its own cache entry (and
      // any subscriber react to the resulting error, e.g. by unmounting)
      // before the cache is cleared.
      setTimeout(() => {
        api.dispatch(baseApi.util.resetApiState());
      }, 0);
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
