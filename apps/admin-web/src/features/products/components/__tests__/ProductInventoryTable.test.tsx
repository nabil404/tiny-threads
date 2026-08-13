import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { ProductInventoryTable } from '../ProductInventoryTable';
import type { Product } from '@store/api/endpoints/productsApi';

function renderTable(
  products: Product[],
  overrides: Partial<React.ComponentProps<typeof ProductInventoryTable>> = {},
) {
  return render(
    <MemoryRouter>
      <ProductInventoryTable
        products={products}
        lowStockThreshold={10}
        currencySymbol="$"
        expandedIds={new Set()}
        onToggleExpand={vi.fn()}
        onDelete={vi.fn()}
        {...overrides}
      />
    </MemoryRouter>,
  );
}

const headphones: Product = {
  id: 'prod-1',
  tenantId: 'tenant-1',
  title: 'Pro Wireless Headphones',
  description: null,
  status: 'active',
  productCategories: [
    { categoryId: 'cat-1', category: { id: 'cat-1', name: 'Electronics', parentId: null } },
  ],
  variants: [
    {
      id: 'var-1',
      productId: 'prod-1',
      name: 'Midnight Black',
      sku: 'WH-PRO-01-BLK',
      priceCents: 25999,
      stock: 85,
      isDefault: true,
    },
    {
      id: 'var-2',
      productId: 'prod-1',
      name: 'Silver Cloud',
      sku: 'WH-PRO-01-SLV',
      priceCents: 23999,
      stock: 60,
      isDefault: false,
    },
  ],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('ProductInventoryTable', () => {
  it('renders the column headers', () => {
    renderTable([headphones]);
    for (const label of ['Product', 'SKU', 'Price', 'Variants', 'Stock', 'Status', 'Actions']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('renders the product title, category, variant count, and status', () => {
    renderTable([headphones]);
    expect(screen.getByText('Pro Wireless Headphones')).toBeInTheDocument();
    expect(screen.getByText('Electronics')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows a price range when variants have different prices', () => {
    renderTable([headphones]);
    expect(screen.getByText('$239.99 - $259.99')).toBeInTheDocument();
  });

  it('shows a single price when all variants share the same price', () => {
    const single: Product = {
      ...headphones,
      variants: [{ ...headphones.variants![0], priceCents: 19900 }],
    };
    renderTable([single]);
    expect(screen.getByText('$199.00')).toBeInTheDocument();
  });

  it('formats prices using the provided currency symbol', () => {
    const single: Product = {
      ...headphones,
      variants: [{ ...headphones.variants![0], priceCents: 19900 }],
    };
    renderTable([single], { currencySymbol: '€' });
    expect(screen.getByText('€199.00')).toBeInTheDocument();
  });

  it('sums variant stock for the row-level stock indicator', () => {
    renderTable([headphones]);
    expect(screen.getByText('145')).toBeInTheDocument();
  });

  it('does not render variant sub-rows until expanded', () => {
    renderTable([headphones]);
    expect(screen.queryByText('Midnight Black')).not.toBeInTheDocument();
  });

  it('renders variant sub-rows with their own sku/price/stock when expanded', () => {
    renderTable([headphones], { expandedIds: new Set(['prod-1']) });
    expect(screen.getByText('Midnight Black')).toBeInTheDocument();
    expect(screen.getByText('WH-PRO-01-BLK')).toBeInTheDocument();
    expect(screen.getByText('$259.99')).toBeInTheDocument();
    expect(screen.getByText('85')).toBeInTheDocument();
  });

  it('calls onToggleExpand with the product id when the expand toggle is clicked', async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();
    renderTable([headphones], { onToggleExpand });

    await user.click(screen.getByRole('button', { name: /expand/i }));
    expect(onToggleExpand).toHaveBeenCalledWith('prod-1');
  });

  it('links the edit action to the product edit route', () => {
    renderTable([headphones]);
    expect(screen.getByRole('link', { name: /edit/i })).toHaveAttribute(
      'href',
      '/products/prod-1/edit',
    );
  });

  it('calls onDelete with the product id when delete is clicked', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    renderTable([headphones], { onDelete });

    await user.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith('prod-1');
  });
});
