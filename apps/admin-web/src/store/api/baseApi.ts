import {
  createApi,
  fetchBaseQuery,
  BaseQueryFn,
  FetchArgs,
  FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import { logout } from '../slices/authSlice';

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
      api.dispatch(logout());
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
