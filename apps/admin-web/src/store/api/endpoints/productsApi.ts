import { baseApi } from '../baseApi';

export interface ProductVariantImage {
  id: string;
  variantId: string;
  storageKey: string;
  url: string;
  altText: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

export interface ProductVariant {
  id: string;
  productId: string;
  name: string | null;
  sku: string;
  priceCents: number;
  stock: number;
  isDefault: boolean;
  images?: ProductVariantImage[];
}

export interface ProductCategory {
  categoryId: string;
  category?: {
    id: string;
    name: string;
    parentId: string | null;
  };
}

export interface Product {
  id: string;
  tenantId: string;
  title: string;
  description: string | null;
  status: 'draft' | 'active' | 'archived';
  variants?: ProductVariant[];
  productCategories?: ProductCategory[];
  createdAt: string;
  updatedAt: string;
}

export interface UpdateProductBody {
  title?: string;
  description?: string;
  status?: 'draft' | 'active' | 'archived';
  categoryIds?: string[];
  variants?: Array<{
    id?: string;
    name?: string;
    sku?: string;
    priceCents?: number;
    stock?: number;
    isDefault?: boolean;
  }>;
}

export const productsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    createProduct: builder.mutation<Product, FormData>({
      query: (formData) => ({
        url: '/merchant-admins/products',
        method: 'POST',
        body: formData,
        // Do NOT set Content-Type — browser sets it with boundary for multipart
      }),
      invalidatesTags: ['Products'],
    }),
    getProduct: builder.query<Product, string>({
      query: (id) => `/merchant-admins/products/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Products', id }],
    }),
    updateProduct: builder.mutation<Product, { id: string; body: UpdateProductBody }>({
      query: ({ id, body }) => ({
        url: `/merchant-admins/products/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Products', id },
        'Products',
      ],
    }),
  }),
});

export const {
  useCreateProductMutation,
  useGetProductQuery,
  useUpdateProductMutation,
} = productsApi;
