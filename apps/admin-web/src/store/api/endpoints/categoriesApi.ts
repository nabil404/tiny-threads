import { baseApi } from '../baseApi';

export interface CategoryTreeNode {
  id: string;
  name: string;
  parentId: string | null;
  children?: CategoryTreeNode[];
}

export const categoriesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getCategories: builder.query<CategoryTreeNode[], void>({
      query: () => '/merchant-admins/categories',
      providesTags: ['Categories'],
    }),
  }),
});

export const { useGetCategoriesQuery } = categoriesApi;
