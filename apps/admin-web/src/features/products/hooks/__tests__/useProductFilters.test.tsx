import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useProductFilters } from '../useProductFilters';

const mockCategories = [
  { id: 'cat-1', name: 'Electronics' },
  { id: 'cat-2', name: 'Clothing' },
];

function createWrapper(initialUrl = '/products') {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[initialUrl]}>{children}</MemoryRouter>
    );
  };
}

describe('useProductFilters', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes with default values when URL search parameters are empty', () => {
    const { result } = renderHook(() => useProductFilters(), {
      wrapper: createWrapper('/products'),
    });

    expect(result.current.search).toBe('');
    expect(result.current.debouncedSearch).toBe('');
    expect(result.current.status).toBe('all');
    expect(result.current.category).toBe('all');
    expect(result.current.resolvedCategoryId).toBeUndefined();
    expect(result.current.page).toBe(1);
    expect(result.current.queryParams).toEqual({
      page: 1,
      limit: 20,
    });
  });

  it('initializes with values parsed from URL search parameters using category name', () => {
    const { result } = renderHook(
      () =>
        useProductFilters({
          categories: mockCategories,
        }),
      {
        wrapper: createWrapper(
          '/products?q=wireless&status=active&category=Electronics&page=3',
        ),
      },
    );

    expect(result.current.search).toBe('wireless');
    expect(result.current.debouncedSearch).toBe('wireless');
    expect(result.current.status).toBe('active');
    expect(result.current.category).toBe('Electronics');
    expect(result.current.resolvedCategoryId).toBe('cat-1');
    expect(result.current.page).toBe(3);
    expect(result.current.queryParams).toEqual({
      page: 3,
      limit: 20,
      status: 'active',
      categoryId: 'cat-1',
      q: 'wireless',
    });
  });

  it('resolves category case-insensitively', () => {
    const { result } = renderHook(
      () =>
        useProductFilters({
          categories: mockCategories,
        }),
      {
        wrapper: createWrapper('/products?category=clothing'),
      },
    );

    expect(result.current.category).toBe('clothing');
    expect(result.current.resolvedCategoryId).toBe('cat-2');
    expect(result.current.queryParams.categoryId).toBe('cat-2');
  });

  it('falls back to default when invalid status or negative page are in URL', () => {
    const { result } = renderHook(() => useProductFilters(), {
      wrapper: createWrapper('/products?status=invalid_status&page=-5'),
    });

    expect(result.current.status).toBe('all');
    expect(result.current.page).toBe(1);
    expect(result.current.queryParams).toEqual({
      page: 1,
      limit: 20,
    });
  });

  it('debounces search input and updates query params after delay', async () => {
    const { result } = renderHook(() => useProductFilters(), {
      wrapper: createWrapper('/products'),
    });

    act(() => {
      result.current.setSearch('keyboard');
    });

    expect(result.current.search).toBe('keyboard');
    expect(result.current.queryParams.q).toBeUndefined();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(result.current.debouncedSearch).toBe('keyboard');
    expect(result.current.queryParams.q).toBe('keyboard');
  });

  it('resets page to 1 when changing status filter', () => {
    const { result } = renderHook(() => useProductFilters(), {
      wrapper: createWrapper('/products?page=3'),
    });

    expect(result.current.page).toBe(3);

    act(() => {
      result.current.setStatus('draft');
    });

    expect(result.current.status).toBe('draft');
    expect(result.current.page).toBe(1);
    expect(result.current.queryParams).toEqual({
      page: 1,
      limit: 20,
      status: 'draft',
    });
  });

  it('resets page to 1 when changing category filter', () => {
    const { result } = renderHook(
      () => useProductFilters({ categories: mockCategories }),
      {
        wrapper: createWrapper('/products?page=2'),
      },
    );

    expect(result.current.page).toBe(2);

    act(() => {
      result.current.setCategory('Clothing');
    });

    expect(result.current.category).toBe('Clothing');
    expect(result.current.resolvedCategoryId).toBe('cat-2');
    expect(result.current.page).toBe(1);
    expect(result.current.queryParams).toEqual({
      page: 1,
      limit: 20,
      categoryId: 'cat-2',
    });
  });

  it('sets isCategoryPending when category is in URL but categories are loading', () => {
    const { result, rerender } = renderHook(
      ({
        isLoading,
        categories,
      }: {
        isLoading: boolean;
        categories: Array<{ id: string; name: string }>;
      }) =>
        useProductFilters({
          categories,
          isCategoriesLoading: isLoading,
        }),
      {
        wrapper: createWrapper('/products?category=Electronics'),
        initialProps: {
          isLoading: true,
          categories: [] as Array<{ id: string; name: string }>,
        },
      },
    );

    expect(result.current.isCategoryPending).toBe(true);
    expect(result.current.queryParams.categoryId).toBeUndefined();

    rerender({ isLoading: false, categories: mockCategories });

    expect(result.current.isCategoryPending).toBe(false);
    expect(result.current.resolvedCategoryId).toBe('cat-1');
    expect(result.current.queryParams.categoryId).toBe('cat-1');
  });

  it('updates page when setPage is called with number or callback', () => {
    const { result } = renderHook(() => useProductFilters(), {
      wrapper: createWrapper('/products'),
    });

    act(() => {
      result.current.setPage(4);
    });

    expect(result.current.page).toBe(4);
    expect(result.current.queryParams.page).toBe(4);

    act(() => {
      result.current.setPage((prev) => prev - 1);
    });

    expect(result.current.page).toBe(3);
    expect(result.current.queryParams.page).toBe(3);
  });

  it('clears all parameters when resetFilters is called', () => {
    const { result } = renderHook(
      () => useProductFilters({ categories: mockCategories }),
      {
        wrapper: createWrapper(
          '/products?q=shoes&status=active&category=Clothing&page=2',
        ),
      },
    );

    act(() => {
      result.current.resetFilters();
    });

    expect(result.current.search).toBe('');
    expect(result.current.status).toBe('all');
    expect(result.current.category).toBe('all');
    expect(result.current.resolvedCategoryId).toBeUndefined();
    expect(result.current.page).toBe(1);
  });

  it('syncs local search input when URL changes externally', () => {
    function useHookWithExternalSetter() {
      const filters = useProductFilters();
      const [, setSearchParams] = useSearchParams();
      return { filters, setSearchParams };
    }

    const { result } = renderHook(() => useHookWithExternalSetter(), {
      wrapper: createWrapper('/products'),
    });

    expect(result.current.filters.search).toBe('');

    act(() => {
      result.current.setSearchParams({ q: 'external-query' });
    });

    expect(result.current.filters.search).toBe('external-query');
    expect(result.current.filters.debouncedSearch).toBe('external-query');
  });
});
