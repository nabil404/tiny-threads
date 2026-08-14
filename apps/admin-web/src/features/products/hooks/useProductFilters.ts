import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDebouncedCallback } from 'use-debounce';

export const SEARCH_DEBOUNCE_MS = 500;
export const DEFAULT_PAGE_SIZE = 20;

export type StatusFilter = 'all' | 'draft' | 'active' | 'archived';

const VALID_STATUSES: StatusFilter[] = ['draft', 'active', 'archived'];

export interface ProductQueryParams {
  page: number;
  limit: number;
  status?: 'draft' | 'active' | 'archived';
  categoryId?: string;
  q?: string;
}

export interface UseProductFiltersOptions {
  pageSize?: number;
  categories?: Array<{ id: string; name: string }>;
  isCategoriesLoading?: boolean;
}

export function useProductFilters(
  options: UseProductFiltersOptions | number = DEFAULT_PAGE_SIZE,
) {
  const normalizedOptions: UseProductFiltersOptions =
    typeof options === 'number' ? { pageSize: options } : options;

  const {
    pageSize = DEFAULT_PAGE_SIZE,
    categories = [],
    isCategoriesLoading = false,
  } = normalizedOptions;

  const [searchParams, setSearchParams] = useSearchParams();

  const urlQ = searchParams.get('q') ?? '';
  const rawStatus = searchParams.get('status');
  const urlStatus: StatusFilter =
    rawStatus && VALID_STATUSES.includes(rawStatus as StatusFilter)
      ? (rawStatus as StatusFilter)
      : 'all';

  // Read human-readable category name from URL ('category' param, with fallback to legacy 'categoryId' if matched)
  const urlCategoryParam = searchParams.get('category');
  const legacyCategoryIdParam = searchParams.get('categoryId');

  const urlCategory: string = useMemo(() => {
    if (urlCategoryParam) {
      return urlCategoryParam;
    }
    if (legacyCategoryIdParam && categories.length > 0) {
      const match = categories.find((c) => c.id === legacyCategoryIdParam);
      if (match) return match.name;
    }
    return 'all';
  }, [urlCategoryParam, legacyCategoryIdParam, categories]);

  // Resolve category name to category UUID
  const matchedCategory = useMemo(() => {
    if (!urlCategory || urlCategory === 'all' || categories.length === 0) {
      return undefined;
    }
    return categories.find(
      (c) => c.name.toLowerCase() === urlCategory.toLowerCase(),
    );
  }, [urlCategory, categories]);

  const resolvedCategoryId = matchedCategory?.id;

  // True if user requested a specific category but category list is still loading
  const isCategoryPending = Boolean(
    urlCategory !== 'all' && isCategoriesLoading && !resolvedCategoryId,
  );

  const rawPage = parseInt(searchParams.get('page') ?? '1', 10);
  const urlPage = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  const [search, setSearchState] = useState(urlQ);
  const [prevUrlQ, setPrevUrlQ] = useState(urlQ);

  const updateUrlSearch = useDebouncedCallback((newSearch: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (newSearch) {
          next.set('q', newSearch);
        } else {
          next.delete('q');
        }
        next.delete('page');
        return next;
      },
      { replace: true },
    );
  }, SEARCH_DEBOUNCE_MS);

  // If the URL search param changed externally (e.g., Back/Forward or direct navigation),
  // synchronize the local search input state immediately.
  if (prevUrlQ !== urlQ) {
    setPrevUrlQ(urlQ);
    setSearchState(urlQ);
    updateUrlSearch.cancel();
  }

  const setSearch = (value: string) => {
    setSearchState(value);
    updateUrlSearch(value);
  };

  const setStatus = (newStatus: StatusFilter) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (newStatus !== 'all') {
          next.set('status', newStatus);
        } else {
          next.delete('status');
        }
        next.delete('page');
        return next;
      },
      { replace: true },
    );
  };

  const setCategory = (newCategory: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (newCategory && newCategory !== 'all') {
          next.set('category', newCategory);
        } else {
          next.delete('category');
        }
        // Remove legacy categoryId if present
        next.delete('categoryId');
        next.delete('page');
        return next;
      },
      { replace: true },
    );
  };

  const setPage = (newPageOrFn: number | ((prev: number) => number)) => {
    setSearchParams(
      (prev) => {
        const currentRawPage = parseInt(prev.get('page') ?? '1', 10);
        const currentPage =
          Number.isInteger(currentRawPage) && currentRawPage > 0
            ? currentRawPage
            : 1;
        const newPage =
          typeof newPageOrFn === 'function'
            ? newPageOrFn(currentPage)
            : newPageOrFn;
        const next = new URLSearchParams(prev);
        if (newPage > 1) {
          next.set('page', String(newPage));
        } else {
          next.delete('page');
        }
        return next;
      },
      { replace: true },
    );
  };

  const resetFilters = () => {
    updateUrlSearch.cancel();
    setSearchState('');
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  const queryParams: ProductQueryParams = useMemo(
    () => ({
      page: urlPage,
      limit: pageSize,
      ...(urlStatus !== 'all' ? { status: urlStatus } : {}),
      ...(resolvedCategoryId ? { categoryId: resolvedCategoryId } : {}),
      ...(urlQ ? { q: urlQ } : {}),
    }),
    [urlPage, pageSize, urlStatus, resolvedCategoryId, urlQ],
  );

  return {
    search,
    debouncedSearch: urlQ,
    status: urlStatus,
    category: urlCategory,
    resolvedCategoryId,
    isCategoryPending,
    page: urlPage,
    queryParams,
    setSearch,
    setStatus,
    setCategory,
    setPage,
    resetFilters,
  };
}
