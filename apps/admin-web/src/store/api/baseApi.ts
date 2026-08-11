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
