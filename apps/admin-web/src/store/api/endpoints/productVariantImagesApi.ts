import { baseApi } from '../baseApi';
import type { ProductVariantImage } from './productsApi';

export const productVariantImagesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    uploadVariantImage: builder.mutation<
      ProductVariantImage,
      { productId: string; variantId: string; file: File }
    >({
      query: ({ productId, variantId, file }) => {
        const formData = new FormData();
        formData.append('image', file);
        return {
          url: `/merchant-admins/products/${productId}/variants/${variantId}/images`,
          method: 'POST',
          body: formData,
        };
      },
      invalidatesTags: ['Products'],
    }),
    deleteVariantImage: builder.mutation<
      void,
      { productId: string; variantId: string; imageId: string }
    >({
      query: ({ productId, variantId, imageId }) => ({
        url: `/merchant-admins/products/${productId}/variants/${variantId}/images/${imageId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Products'],
    }),
  }),
});

export const {
  useUploadVariantImageMutation,
  useDeleteVariantImageMutation,
} = productVariantImagesApi;
