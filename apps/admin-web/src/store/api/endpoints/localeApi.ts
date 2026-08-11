import { baseApi } from '../baseApi';

export interface LocaleResponse {
  locale: string | null;
}

export interface UpdateLocaleRequest {
  locale: string | null;
}

export const localeApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    updateLocale: builder.mutation<LocaleResponse, UpdateLocaleRequest>({
      query: (body) => ({
        url: '/merchant-admins/me/locale',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Locale'],
    }),
  }),
});

export const { useUpdateLocaleMutation } = localeApi;
