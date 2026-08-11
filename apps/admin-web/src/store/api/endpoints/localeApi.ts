import { baseApi } from '../baseApi';

export interface GetLocaleResponse {
  locale: string | null;
}

export interface UpdateLocaleRequest {
  locale: string | null;
}

export const localeApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getLocale: builder.query<GetLocaleResponse, void>({
      query: () => '/merchant-admins/me/locale',
      providesTags: ['Locale'],
    }),
    updateLocale: builder.mutation<GetLocaleResponse, UpdateLocaleRequest>({
      query: (body) => ({
        url: '/merchant-admins/me/locale',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Locale'],
    }),
  }),
});

export const {
  useGetLocaleQuery,
  useLazyGetLocaleQuery,
  useUpdateLocaleMutation,
} = localeApi;
