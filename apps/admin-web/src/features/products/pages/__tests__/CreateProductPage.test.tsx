import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from '@store/index';
import { CreateProductPage } from '../CreateProductPage';
import * as productsApiHooks from '@store/api/endpoints/productsApi';
import * as categoriesApiHooks from '@store/api/endpoints/categoriesApi';

describe('CreateProductPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders product form with Add New Product title', () => {
    const mockCreateMutation = vi.fn();
    vi.spyOn(productsApiHooks, 'useCreateProductMutation').mockReturnValue([
      mockCreateMutation as any,
      { isLoading: false } as any,
    ]);
    vi.spyOn(categoriesApiHooks, 'useGetCategoriesQuery').mockReturnValue({
      data: [],
      isLoading: false,
    } as any);

    render(
      <Provider store={store}>
        <MemoryRouter>
          <CreateProductPage />
        </MemoryRouter>
      </Provider>,
    );

    expect(screen.getByRole('heading', { name: 'Add New Product' })).toBeInTheDocument();
  });

  it('submits form payload and navigates on success', async () => {
    const mockUnwrap = vi.fn().mockResolvedValue({ id: 'prod-123' });
    const mockCreateMutation = vi.fn().mockReturnValue({ unwrap: mockUnwrap });
    vi.spyOn(productsApiHooks, 'useCreateProductMutation').mockReturnValue([
      mockCreateMutation as any,
      { isLoading: false } as any,
    ]);
    vi.spyOn(categoriesApiHooks, 'useGetCategoriesQuery').mockReturnValue({
      data: [],
      isLoading: false,
    } as any);

    const user = userEvent.setup();

    render(
      <Provider store={store}>
        <MemoryRouter>
          <CreateProductPage />
        </MemoryRouter>
      </Provider>,
    );

    const titleInput = screen.getByLabelText(/product name/i);
    await user.type(titleInput, 'New Test Product');

    const skuInput = screen.getByPlaceholderText(/sku/i);
    await user.type(skuInput, 'TEST-SKU-1');

    const priceInput = screen.getByPlaceholderText(/0\.00/i);
    await user.clear(priceInput);
    await user.type(priceInput, '19.99');

    const saveButton = screen.getByRole('button', { name: /save product/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockCreateMutation).toHaveBeenCalled();
    });
  });

  it('displays error banner when creation fails', async () => {
    const mockUnwrap = vi.fn().mockRejectedValue({
      data: {
        error: {
          code: 'PRODUCT_SKU_EXISTS',
          message: 'SKU already exists',
        },
      },
    });
    const mockCreateMutation = vi.fn().mockReturnValue({ unwrap: mockUnwrap });
    vi.spyOn(productsApiHooks, 'useCreateProductMutation').mockReturnValue([
      mockCreateMutation as any,
      { isLoading: false } as any,
    ]);
    vi.spyOn(categoriesApiHooks, 'useGetCategoriesQuery').mockReturnValue({
      data: [],
      isLoading: false,
    } as any);

    const user = userEvent.setup();

    render(
      <Provider store={store}>
        <MemoryRouter>
          <CreateProductPage />
        </MemoryRouter>
      </Provider>,
    );

    const titleInput = screen.getByLabelText(/product name/i);
    await user.type(titleInput, 'New Test Product');

    const skuInput = screen.getByPlaceholderText(/sku/i);
    await user.type(skuInput, 'EXISTS-SKU');

    const saveButton = screen.getByRole('button', { name: /save product/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('SKU already exists')).toBeInTheDocument();
    });
  });
});
