import {
  createApi,
  fetchBaseQuery,
  BaseQueryFn,
  FetchArgs,
  FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import type { RootState } from '../index';
import { loginSuccess, logout } from '../slices/authSlice';
import { parseJwtPayload, MerchantJwtPayload } from '../../lib/jwt';

const rawBaseQuery = fetchBaseQuery({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  credentials: 'include',
  prepareHeaders: (headers, { getState }) => {
    const state = getState() as RootState;
    const token = state.auth?.token;
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  },
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
      const { accessToken } = refreshResult.data as { accessToken: string };
      const payload = parseJwtPayload<MerchantJwtPayload>(accessToken);
      const tenantId = payload?.tenantId ?? 'tenant_demo_1';

      api.dispatch(
        loginSuccess({
          token: accessToken,
          user: {
            id: payload?.sub ?? 'usr_m1',
            email: 'Merchant Admin',
            name: 'Merchant Admin',
            role: payload?.role ?? 'MERCHANT_ADMIN',
          },
          tenantId,
        }),
      );

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
