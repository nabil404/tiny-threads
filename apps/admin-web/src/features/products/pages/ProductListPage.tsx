import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@components/ui/button';
import { ConfirmDialog } from '@components/ui/confirm-dialog';
import { Input } from '@components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@components/ui/select';
import { useProductFilters, type StatusFilter } from '../hooks/useProductFilters';
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
const DEFAULT_CURRENCY_SYMBOL = '$';

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
  const { t } = useTranslation();
  const { data: categoryTree = [], isLoading: isCategoriesLoading } =
    useGetCategoriesQuery();
  const { data: stats, isLoading: statsLoading } = useGetProductStatsQuery();
  const { data: settings } = useGetTenantSettingsQuery();
  const [deleteProduct] = useDeleteProductMutation();

  const flatCategories = useMemo(
    () => flattenCategories(categoryTree),
    [categoryTree],
  );

  const {
    search,
    status,
    category,
    page,
    queryParams,
    isCategoryPending,
    setSearch,
    setStatus,
    setCategory,
    setPage,
  } = useProductFilters({
    pageSize: PAGE_SIZE,
    categories: flatCategories,
    isCategoriesLoading,
  });
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const { data, isLoading } = useGetProductsQuery(queryParams, {
    skip: isCategoryPending,
  });

  const lowStockThreshold = settings?.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
  const currencySymbol = settings?.defaultCurrencySymbol ?? DEFAULT_CURRENCY_SYMBOL;

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [productToDelete, setProductToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = (id: string) => {
    setProductToDelete(id);
  };

  const handleConfirmDelete = async () => {
    if (!productToDelete) return;
    setIsDeleting(true);
    try {
      await deleteProduct(productToDelete).unwrap();
      toast.success(t('products.deleteSuccess'));
      setProductToDelete(null);
    } catch (err) {
      toast.error(extractErrorMessage(err, t('products.deleteError')));
    } finally {
      setIsDeleting(false);
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
          <h1 className="text-2xl font-bold tracking-tight">{t('products.pageTitle')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('products.pageDescription')}
          </p>
        </div>
        <Button asChild>
          <Link to="/products/new">
            <Plus className="h-4 w-4 mr-1" />
            {t('products.addProduct')}
          </Link>
        </Button>
      </div>

      <ProductStatsCards stats={stats} isLoading={statsLoading} />

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <Input
            placeholder={t('products.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:max-w-sm"
          />
          <div className="flex gap-2">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t('products.allCategories')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('products.allCategories')}</SelectItem>
                {flatCategories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.name}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder={t('products.allStatuses')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('products.allStatuses')}</SelectItem>
                <SelectItem value="active">{t('products.statusActive')}</SelectItem>
                <SelectItem value="draft">{t('products.statusDraft')}</SelectItem>
                <SelectItem value="archived">{t('products.statusArchived')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {t('products.loading')}
          </div>
        ) : products.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {t('products.noResults')}
          </div>
        ) : (
          <ProductInventoryTable
            products={products}
            lowStockThreshold={lowStockThreshold}
            currencySymbol={currencySymbol}
            expandedIds={expandedIds}
            onToggleExpand={toggleExpand}
            onDelete={handleDelete}
          />
        )}

        <div className="flex items-center justify-between border-t border-border p-4">
          <span className="text-sm text-muted-foreground">
            {t('products.showingEntries', { start: rangeStart, end: rangeEnd, total })}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              {t('products.prev')}
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
              {t('products.next')}
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={productToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setProductToDelete(null);
        }}
        title={t('products.deleteProductTitle')}
        description={t('products.deleteConfirm')}
        confirmText={t('products.delete')}
        cancelText={t('common.cancel')}
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
