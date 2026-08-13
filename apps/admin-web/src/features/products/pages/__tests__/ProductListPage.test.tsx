import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from '@store/index';
import { ProductListPage } from '../ProductListPage';
import * as productsApiHooks from '@store/api/endpoints/productsApi';
import * as categoriesApiHooks from '@store/api/endpoints/categoriesApi';
import * as settingsApiHooks from '@store/api/endpoints/settingsApi';

const product = {
  id: 'prod-1',
  tenantId: 'tenant-1',
  title: 'Pro Wireless Headphones',
  description: null,
  status: 'active' as const,
  productCategories: [],
  variants: [
    {
      id: 'var-1',
      productId: 'prod-1',
      name: null,
      sku: 'WH-PRO-01',
      priceCents: 25999,
      stock: 85,
      isDefault: true,
    },
  ],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function mockHooks(
  overrides: {
    getProducts?: Partial<ReturnType<typeof productsApiHooks.useGetProductsQuery>>;
    deleteProduct?: ReturnType<typeof vi.fn>;
  } = {},
) {
  vi.spyOn(productsApiHooks, 'useGetProductsQuery').mockReturnValue({
    data: { items: [product], total: 1, page: 1, limit: 20 },
    isLoading: false,
    isFetching: false,
    ...overrides.getProducts,
  } as any);
  vi.spyOn(productsApiHooks, 'useGetProductStatsQuery').mockReturnValue({
    data: { totalProducts: 1, activeListings: 1, lowStock: 0, outOfStock: 0 },
    isLoading: false,
  } as any);
  const deleteMock = overrides.deleteProduct ?? vi.fn().mockReturnValue({ unwrap: vi.fn().mockResolvedValue(undefined) });
  vi.spyOn(productsApiHooks, 'useDeleteProductMutation').mockReturnValue([
    deleteMock as any,
    { isLoading: false } as any,
  ]);
  vi.spyOn(categoriesApiHooks, 'useGetCategoriesQuery').mockReturnValue({
    data: [{ id: 'cat-1', name: 'Electronics', parentId: null }],
    isLoading: false,
  } as any);
  vi.spyOn(settingsApiHooks, 'useGetTenantSettingsQuery').mockReturnValue({
    data: { lowStockThreshold: 10 } as any,
    isLoading: false,
  } as any);
  return deleteMock;
}

function renderPage() {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <ProductListPage />
      </MemoryRouter>
    </Provider>,
  );
}

describe('ProductListPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the page title, stat cards, and product rows', () => {
    mockHooks();
    renderPage();

    expect(screen.getByRole('heading', { name: 'Product Inventory' })).toBeInTheDocument();
    expect(screen.getByText('Total Products')).toBeInTheDocument();
    expect(screen.getByText('Pro Wireless Headphones')).toBeInTheDocument();
  });

  it('links Add Product to the create-product route', () => {
    mockHooks();
    renderPage();

    expect(screen.getByRole('link', { name: /add product/i })).toHaveAttribute(
      'href',
      '/products/new',
    );
  });

  it('shows an empty state when there are no products', () => {
    mockHooks({ getProducts: { data: { items: [], total: 0, page: 1, limit: 20 } } });
    renderPage();

    expect(screen.getByText(/no products found/i)).toBeInTheDocument();
  });

  it('debounces search input and requeries with the q param', async () => {
    vi.useFakeTimers();
    const getProductsSpy = vi.spyOn(productsApiHooks, 'useGetProductsQuery');
    mockHooks();

    renderPage();

    fireEvent.change(screen.getByPlaceholderText(/search by name or sku/i), {
      target: { value: 'headphones' },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(getProductsSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: 'headphones' }),
    );
    vi.useRealTimers();
  });

  it('confirms and calls deleteProduct when the delete action is used', async () => {
    const user = userEvent.setup();
    const unwrapMock = vi.fn().mockResolvedValue(undefined);
    const deleteMock = vi.fn().mockReturnValue({ unwrap: unwrapMock });
    mockHooks({ deleteProduct: deleteMock });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderPage();

    await user.click(screen.getByRole('button', { name: /delete/i }));

    expect(deleteMock).toHaveBeenCalledWith('prod-1');
  });

  it('does not call deleteProduct when the confirmation is dismissed', async () => {
    const user = userEvent.setup();
    const deleteMock = vi.fn();
    mockHooks({ deleteProduct: deleteMock });
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderPage();

    await user.click(screen.getByRole('button', { name: /delete/i }));

    expect(deleteMock).not.toHaveBeenCalled();
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
