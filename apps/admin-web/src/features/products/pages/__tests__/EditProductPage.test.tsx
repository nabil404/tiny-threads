import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from '@store/index';
import { EditProductPage } from '../EditProductPage';
import * as productsApiHooks from '@store/api/endpoints/productsApi';
import * as categoriesApiHooks from '@store/api/endpoints/categoriesApi';

const mockProductData: productsApiHooks.Product = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  tenantId: '123e4567-e89b-12d3-a456-426614174001',
  title: 'Existing Product',
  description: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Existing description' }],
      },
    ],
  },
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  productCategories: [],
  variants: [
    {
      id: '123e4567-e89b-12d3-a456-426614174002',
      productId: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Default Variant',
      sku: 'EXISTING-SKU-1',
      priceCents: 2500,
      stock: 10,
      isDefault: true,
      images: [],
    },
  ],
};

function renderWithRouter(initialEntry = '/products/123e4567-e89b-12d3-a456-426614174000/edit') {
  const router = createMemoryRouter(
    [
      {
        path: '/products/:id/edit',
        element: <EditProductPage />,
      },
    ],
    { initialEntries: [initialEntry] },
  );

  return render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
}

describe('EditProductPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading indicator while product fetching', () => {
    vi.spyOn(productsApiHooks, 'useGetProductQuery').mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as any);
    vi.spyOn(productsApiHooks, 'useUpdateProductMutation').mockReturnValue([
      vi.fn() as any,
      { isLoading: false } as any,
    ]);

    renderWithRouter();

    expect(screen.getByText('Loading product...')).toBeInTheDocument();
  });

  it('renders error message when product fetch fails', () => {
    vi.spyOn(productsApiHooks, 'useGetProductQuery').mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as any);
    vi.spyOn(productsApiHooks, 'useUpdateProductMutation').mockReturnValue([
      vi.fn() as any,
      { isLoading: false } as any,
    ]);

    renderWithRouter();

    expect(screen.getByText('Product not found or failed to load.')).toBeInTheDocument();
  });

  it('renders populated form and submits updates', async () => {
    vi.spyOn(productsApiHooks, 'useGetProductQuery').mockReturnValue({
      data: mockProductData,
      isLoading: false,
      isError: false,
    } as any);

    const mockUnwrap = vi.fn().mockResolvedValue({});
    const mockUpdateMutation = vi.fn().mockReturnValue({ unwrap: mockUnwrap });
    vi.spyOn(productsApiHooks, 'useUpdateProductMutation').mockReturnValue([
      mockUpdateMutation as any,
      { isLoading: false } as any,
    ]);
    vi.spyOn(categoriesApiHooks, 'useGetCategoriesQuery').mockReturnValue({
      data: [],
      isLoading: false,
    } as any);

    const user = userEvent.setup();

    renderWithRouter();

    expect(screen.getByRole('heading', { name: 'Edit Product' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Existing Product')).toBeInTheDocument();

    const titleInput = screen.getByLabelText(/product name/i);
    await user.clear(titleInput);
    await user.type(titleInput, 'Updated Product Title');

    const saveButton = screen.getByRole('button', { name: /save product/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateMutation).toHaveBeenCalledWith({
        id: '123e4567-e89b-12d3-a456-426614174000',
        body: expect.objectContaining({
          title: 'Updated Product Title',
        }),
      });
    });
  });
});
