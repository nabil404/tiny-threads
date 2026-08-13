import { baseApi } from '../baseApi';

export interface TenantSettings {
  id: string;
  tenantId: string;
  allowGuestCheckout: boolean;
  platformFeePercent: number;
  defaultCurrencyCode: string;
  captureMode: string;
  lowStockThreshold: number;
}

export const settingsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getTenantSettings: builder.query<TenantSettings, void>({
      query: () => '/merchant-admins/settings',
      providesTags: ['Settings'],
    }),
  }),
});

export const { useGetTenantSettingsQuery } = settingsApi;
