import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

export interface StockIndicatorProps {
  stock: number;
  lowStockThreshold: number;
}

export function StockIndicator({ stock, lowStockThreshold }: StockIndicatorProps) {
  const { t } = useTranslation();
  const status =
    stock === 0 ? 'out' : stock <= lowStockThreshold ? 'low' : 'in';
  const label =
    status === 'out'
      ? t('products.stockOut')
      : status === 'low'
        ? t('products.stockLow')
        : t('products.stockIn');

  const fillCap = Math.max(1, lowStockThreshold * 3);
  const fillPercent = Math.min(100, (stock / fillCap) * 100);

  return (
    <div className="flex flex-col gap-1 w-full max-w-[120px]">
      <span
        className={cn(
          'text-sm font-medium',
          status === 'out' && 'text-destructive',
          status === 'low' && 'text-amber-600 dark:text-amber-500',
          status === 'in' && 'text-foreground',
        )}
      >
        {stock}
      </span>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={stock}
        aria-valuemin={0}
        className="h-1.5 w-full rounded-full bg-muted overflow-hidden"
      >
        <div
          className={cn(
            'h-full rounded-full',
            status === 'out' && 'bg-destructive',
            status === 'low' && 'bg-amber-500',
            status === 'in' && 'bg-emerald-500',
          )}
          style={{ width: `${fillPercent}%` }}
        />
      </div>
    </div>
  );
}
