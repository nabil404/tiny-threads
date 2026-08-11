import { baseApi } from '../baseApi';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
}

export interface GetMeResponse {
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
    locale: string | null;
  };
  tenant: {
    id: string;
    name: string;
  };
}

export const authApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getMe: builder.query<GetMeResponse, void>({
      query: () => '/merchant-admins/auth/me',
      providesTags: ['Auth'],
    }),
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
  useGetMeQuery,
  useLazyGetMeQuery,
  useLoginMutation,
  useRefreshMutation,
  useLogoutMutation,
} = authApi;
