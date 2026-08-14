import type { JSONContent } from '@tiptap/react';
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
  clientKey?: string;
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
  description: JSONContent | null;
  status: 'draft' | 'active' | 'archived';
  variants?: ProductVariant[];
  productCategories?: ProductCategory[];
  createdAt: string;
  updatedAt: string;
}

export interface UpdateProductBody {
  title?: string;
  description?: JSONContent;
  status?: 'draft' | 'active' | 'archived';
  categoryIds?: string[];
  variants?: Array<{
    id?: string;
    clientKey?: string;
    name?: string;
    sku?: string;
    priceCents?: number;
    stock?: number;
    isDefault?: boolean;
  }>;
}

export interface CreateProductBody {
  title: string;
  description?: JSONContent;
  status: 'draft' | 'active' | 'archived';
  categoryIds?: string[];
  variants?: Array<{
    clientKey?: string;
    name?: string;
    sku: string;
    priceCents: number;
    stock: number;
    isDefault?: boolean;
  }>;
}

export interface ProductListParams {
  page?: number;
  limit?: number;
  status?: 'draft' | 'active' | 'archived';
  categoryId?: string;
  q?: string;
}

export interface PaginatedProducts {
  items: Product[];
  total: number;
  page: number;
  limit: number;
}

export interface ProductStats {
  totalProducts: number;
  activeListings: number;
  lowStock: number;
  outOfStock: number;
}

export const productsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    createProduct: builder.mutation<Product, CreateProductBody>({
      query: (body) => ({
        url: '/merchant-admins/products',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Products'],
    }),
    getProduct: builder.query<Product, string>({
      query: (id) => `/merchant-admins/products/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Products', id }],
    }),
    updateProduct: builder.mutation<
      Product,
      { id: string; body: UpdateProductBody }
    >({
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
    getProducts: builder.query<PaginatedProducts, ProductListParams | void>({
      query: (params) => ({
        url: '/merchant-admins/products',
        params: params ?? undefined,
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map(({ id }) => ({
                type: 'Products' as const,
                id,
              })),
              { type: 'Products' as const, id: 'LIST' },
            ]
          : [{ type: 'Products' as const, id: 'LIST' }],
    }),
    getProductStats: builder.query<ProductStats, void>({
      query: () => '/merchant-admins/products/stats',
      providesTags: ['Products'],
    }),
    deleteProduct: builder.mutation<void, string>({
      query: (id) => ({
        url: `/merchant-admins/products/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, id) => [
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
  useGetProductsQuery,
  useGetProductStatsQuery,
  useDeleteProductMutation,
} = productsApi;
