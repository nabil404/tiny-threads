import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import { baseApi } from '../baseApi';
import type { ProductVariantImage } from './productsApi';
import {
  axiosUploadClient,
  refreshSession,
  toQueryError,
} from '@lib/axios-upload-client';

async function performUpload(
  productId: string,
  variantId: string,
  file: File,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
) {
  const formData = new FormData();
  formData.append('image', file);
  return axiosUploadClient.post<ProductVariantImage>(
    `/merchant-admins/products/${productId}/variants/${variantId}/images`,
    formData,
    {
      signal,
      onUploadProgress: (evt) => {
        if (onProgress && evt.total) {
          onProgress(Math.round((evt.loaded / evt.total) * 100));
        }
      },
    },
  );
}

export const productVariantImagesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    uploadVariantImage: builder.mutation<
      ProductVariantImage,
      {
        productId: string;
        variantId: string;
        file: File;
        onProgress?: (percent: number) => void;
        signal?: AbortSignal;
      }
    >({
      queryFn: async ({ productId, variantId, file, onProgress, signal }) => {
        try {
          const response = await performUpload(
            productId,
            variantId,
            file,
            onProgress,
            signal,
          );
          return { data: response.data };
        } catch (err: unknown) {
          const axiosErr = err as { response?: { status?: number } };
          if (axiosErr.response?.status === 401) {
            const refreshed = await refreshSession();
            if (refreshed) {
              try {
                const retryResponse = await performUpload(
                  productId,
                  variantId,
                  file,
                  onProgress,
                  signal,
                );
                return { data: retryResponse.data };
              } catch (retryErr) {
                return { error: toQueryError(retryErr) as FetchBaseQueryError };
              }
            }
          }
          return { error: toQueryError(err) as FetchBaseQueryError };
        }
      },
    }),
    deleteVariantImage: builder.mutation<
      void,
      { productId: string; variantId: string; imageId: string }
    >({
      query: ({ productId, variantId, imageId }) => ({
        url: `/merchant-admins/products/${productId}/variants/${variantId}/images/${imageId}`,
        method: 'DELETE',
      }),
    }),
    reorderVariantImages: builder.mutation<
      ProductVariantImage[],
      { productId: string; variantId: string; imageIds: string[] }
    >({
      query: ({ productId, variantId, imageIds }) => ({
        url: `/merchant-admins/products/${productId}/variants/${variantId}/images/reorder`,
        method: 'PUT',
        body: { imageIds },
      }),
    }),
    setPrimaryVariantImage: builder.mutation<
      ProductVariantImage,
      { productId: string; variantId: string; imageId: string }
    >({
      query: ({ productId, variantId, imageId }) => ({
        url: `/merchant-admins/products/${productId}/variants/${variantId}/images/${imageId}`,
        method: 'PATCH',
        body: { isPrimary: true },
      }),
    }),
  }),
});

export const {
  useUploadVariantImageMutation,
  useDeleteVariantImageMutation,
  useReorderVariantImagesMutation,
  useSetPrimaryVariantImageMutation,
} = productVariantImagesApi;
