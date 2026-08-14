import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { toast } from 'sonner';
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
      expect.anything(),
    );
    vi.useRealTimers();
  });

  it('confirms and calls deleteProduct when the delete action is used', async () => {
    const toastSpy = vi.spyOn(toast, 'success');
    const user = userEvent.setup();
    const unwrapMock = vi.fn().mockResolvedValue(undefined);
    const deleteMock = vi.fn().mockReturnValue({ unwrap: unwrapMock });
    mockHooks({ deleteProduct: deleteMock });

    renderPage();

    await user.click(screen.getByRole('button', { name: /delete/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /delete product/i })).toBeInTheDocument();

    const dialog = screen.getByRole('dialog');
    const confirmButton = within(dialog).getByRole('button', { name: /^delete$/i });
    await user.click(confirmButton);

    expect(deleteMock).toHaveBeenCalledWith('prod-1');
    expect(toastSpy).toHaveBeenCalledWith('Product deleted successfully');
  });

  it('does not call deleteProduct when the confirmation is dismissed', async () => {
    const user = userEvent.setup();
    const deleteMock = vi.fn();
    mockHooks({ deleteProduct: deleteMock });

    renderPage();

    await user.click(screen.getByRole('button', { name: /delete/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    const dialog = screen.getByRole('dialog');
    const cancelButton = within(dialog).getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    expect(deleteMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('initializes filters and search from URL search parameters', () => {
    const getProductsSpy = vi.spyOn(productsApiHooks, 'useGetProductsQuery');
    mockHooks();

    render(
      <Provider store={store}>
        <MemoryRouter
          initialEntries={[
            '/products?q=wireless&status=active&category=Electronics&page=2',
          ]}
        >
          <ProductListPage />
        </MemoryRouter>
      </Provider>,
    );

    expect(getProductsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        q: 'wireless',
        status: 'active',
        categoryId: 'cat-1',
        page: 2,
      }),
      expect.anything(),
    );

    expect(screen.getByPlaceholderText(/search by name or sku/i)).toHaveValue(
      'wireless',
    );
  });

  it('navigates pages using Next and Prev pagination buttons', async () => {
    const user = userEvent.setup();
    const getProductsSpy = vi.spyOn(productsApiHooks, 'useGetProductsQuery');
    mockHooks({
      getProducts: {
        data: { items: [product], total: 60, page: 1, limit: 20 },
      },
    });

    renderPage();

    const nextBtn = screen.getByRole('button', { name: /^next$/i });
    expect(nextBtn).toBeEnabled();
    await user.click(nextBtn);

    expect(getProductsSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
      expect.anything(),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
