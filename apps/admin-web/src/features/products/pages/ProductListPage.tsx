import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@components/ui/select';
import { ProductStatsCards } from '../components/ProductStatsCards';
import { ProductInventoryTable } from '../components/ProductInventoryTable';
import {
  useGetProductsQuery,
  useGetProductStatsQuery,
  useDeleteProductMutation,
} from '@store/api/endpoints/productsApi';
import {
  useGetCategoriesQuery,
  type CategoryTreeNode,
} from '@store/api/endpoints/categoriesApi';
import { useGetTenantSettingsQuery } from '@store/api/endpoints/settingsApi';
import { extractErrorMessage } from '@lib/extract-error-message';

const PAGE_SIZE = 20;
const DEFAULT_LOW_STOCK_THRESHOLD = 10;
const SEARCH_DEBOUNCE_MS = 500;

type StatusFilter = 'all' | 'draft' | 'active' | 'archived';

function flattenCategories(
  nodes: CategoryTreeNode[],
  depth = 0,
): Array<{ id: string; name: string; depth: number }> {
  const result: Array<{ id: string; name: string; depth: number }> = [];
  for (const node of nodes) {
    result.push({ id: node.id, name: node.name, depth });
    if (node.children && node.children.length > 0) {
      result.push(...flattenCategories(node.children, depth + 1));
    }
  }
  return result;
}

export function ProductListPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [categoryId, setCategoryId] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [search]);

  const filterKey = `${debouncedSearch}|${status}|${categoryId}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const queryParams = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      ...(status !== 'all' ? { status } : {}),
      ...(categoryId !== 'all' ? { categoryId } : {}),
      ...(debouncedSearch ? { q: debouncedSearch } : {}),
    }),
    [page, status, categoryId, debouncedSearch],
  );

  const { data, isLoading } = useGetProductsQuery(queryParams);
  const { data: stats, isLoading: statsLoading } = useGetProductStatsQuery();
  const { data: categoryTree = [] } = useGetCategoriesQuery();
  const { data: settings } = useGetTenantSettingsQuery();
  const [deleteProduct] = useDeleteProductMutation();

  const lowStockThreshold = settings?.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
  const flatCategories = useMemo(() => flattenCategories(categoryTree), [categoryTree]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this product? This cannot be undone.')) return;
    try {
      await deleteProduct(id).unwrap();
      toast.success('Product deleted');
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Failed to delete product'));
    }
  };

  const products = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = products.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = (page - 1) * PAGE_SIZE + products.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Product Inventory</h1>
          <p className="text-sm text-muted-foreground">
            Manage your store's catalog and monitor stock levels.
          </p>
        </div>
        <Button asChild>
          <Link to="/products/new">
            <Plus className="h-4 w-4 mr-1" />
            Add Product
          </Link>
        </Button>
      </div>

      <ProductStatsCards stats={stats} isLoading={statsLoading} />

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <Input
            placeholder="Search by name or SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:max-w-sm"
          />
          <div className="flex gap-2">
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {flatCategories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Loading products...
          </div>
        ) : products.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No products found.
          </div>
        ) : (
          <ProductInventoryTable
            products={products}
            lowStockThreshold={lowStockThreshold}
            expandedIds={expandedIds}
            onToggleExpand={toggleExpand}
            onDelete={handleDelete}
          />
        )}

        <div className="flex items-center justify-between border-t border-border p-4">
          <span className="text-sm text-muted-foreground">
            Showing {rangeStart} to {rangeEnd} of {total} entries
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Prev
            </Button>
            <span className="px-2 text-sm text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
