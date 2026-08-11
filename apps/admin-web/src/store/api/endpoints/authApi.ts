import { baseApi } from '../baseApi';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
}

export const authApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation<LoginResponse, LoginRequest>({
      query: (credentials) => ({
        url: '/merchant-admins/auth/login',
        method: 'POST',
        body: credentials,
      }),
      invalidatesTags: ['Auth'],
    }),
    refresh: builder.mutation<LoginResponse, void>({
      query: () => ({
        url: '/merchant-admins/auth/refresh',
        method: 'POST',
      }),
      invalidatesTags: ['Auth'],
    }),
    logout: builder.mutation<{ success: boolean }, void>({
      query: () => ({
        url: '/merchant-admins/auth/logout',
        method: 'POST',
      }),
      invalidatesTags: ['Auth', 'Locale', 'Products', 'Orders', 'Settings'],
    }),
  }),
});

export const {
  useLoginMutation,
  useRefreshMutation,
  useLogoutMutation,
} = authApi;
