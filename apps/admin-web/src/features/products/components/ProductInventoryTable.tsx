import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, ImageIcon, Pencil, Trash2 } from 'lucide-react';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@components/ui/table';
import { Badge } from '@components/ui/badge';
import { Button } from '@components/ui/button';
import { StockIndicator } from './StockIndicator';
import { priceCentsToDollars } from '../schemas/product-form.schema';
import type { Product, ProductVariant } from '@store/api/endpoints/productsApi';

export interface ProductInventoryTableProps {
  products: Product[];
  lowStockThreshold: number;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onDelete: (id: string) => void;
}

function formatPrice(cents: number): string {
  return `$${priceCentsToDollars(cents).toFixed(2)}`;
}

function priceRange(variants: ProductVariant[]): string {
  if (variants.length === 0) return '—';
  const prices = variants.map((v) => v.priceCents);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? formatPrice(min) : `${formatPrice(min)} - ${formatPrice(max)}`;
}

function totalStock(variants: ProductVariant[]): number {
  return variants.reduce((sum, v) => sum + v.stock, 0);
}

function StatusBadge({ status }: { status: Product['status'] }) {
  const { t } = useTranslation();
  const STATUS_LABEL: Record<Product['status'], string> = {
    active: t('products.statusActive'),
    draft: t('products.statusDraft'),
    archived: t('products.statusArchived'),
  };
  const variant = status === 'active' ? 'default' : 'secondary';
  return <Badge variant={variant}>{STATUS_LABEL[status]}</Badge>;
}

function primaryImageUrl(variants: ProductVariant[]): string | undefined {
  for (const variant of variants) {
    const primary = variant.images?.find((img) => img.isPrimary) ?? variant.images?.[0];
    if (primary) return primary.url;
  }
  return undefined;
}

export function ProductInventoryTable({
  products,
  lowStockThreshold,
  expandedIds,
  onToggleExpand,
  onDelete,
}: ProductInventoryTableProps) {
  const { t } = useTranslation();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('products.tableProduct')}</TableHead>
          <TableHead>{t('products.tableSku')}</TableHead>
          <TableHead>{t('products.tablePrice')}</TableHead>
          <TableHead>{t('products.tableVariants')}</TableHead>
          <TableHead>{t('products.tableStock')}</TableHead>
          <TableHead>{t('products.tableStatus')}</TableHead>
          <TableHead className="text-right">{t('products.tableActions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product) => {
          const variants = product.variants ?? [];
          const isExpanded = expandedIds.has(product.id);
          const categoryName = product.productCategories?.[0]?.category?.name;
          const imageUrl = primaryImageUrl(variants);

          return (
            <>
              <TableRow key={product.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    {variants.length > 0 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 cursor-pointer"
                        aria-label={isExpanded ? t('products.collapse') : t('products.expand')}
                        onClick={() => onToggleExpand(product.id)}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                      {imageUrl ? (
                        <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{product.title}</p>
                      {categoryName && (
                        <p className="text-sm text-muted-foreground">{categoryName}</p>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">—</TableCell>
                <TableCell>{priceRange(variants)}</TableCell>
                <TableCell className="text-muted-foreground">{variants.length}</TableCell>
                <TableCell>
                  <StockIndicator
                    stock={totalStock(variants)}
                    lowStockThreshold={lowStockThreshold}
                  />
                </TableCell>
                <TableCell>
                  <StatusBadge status={product.status} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 cursor-pointer" asChild>
                      <Link to={`/products/${product.id}/edit`} aria-label={t('products.edit')}>
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 cursor-pointer"
                      aria-label={t('products.delete')}
                      onClick={() => onDelete(product.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
              {isExpanded &&
                variants.map((variant) => (
                  <TableRow key={variant.id} className="bg-muted/40">
                    <TableCell className="pl-16 text-muted-foreground">
                      {variant.name ?? t('products.defaultVariant')}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {variant.sku}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatPrice(variant.priceCents)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">—</TableCell>
                    <TableCell>
                      <StockIndicator stock={variant.stock} lowStockThreshold={lowStockThreshold} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={product.status} />
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ))}
            </>
          );
        })}
      </TableBody>
    </Table>
  );
}
