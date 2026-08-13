import { Card } from '@components/ui/card';
import { useTranslation } from 'react-i18next';
import type { ProductStats } from '@store/api/endpoints/productsApi';

export interface ProductStatsCardsProps {
  stats?: ProductStats;
  isLoading: boolean;
}

export function ProductStatsCards({ stats, isLoading }: ProductStatsCardsProps) {
  const { t } = useTranslation();
  
  const CARD_DEFS: Array<{ label: string; key: keyof ProductStats }> = [
    { label: t('products.totalProducts'), key: 'totalProducts' },
    { label: t('products.activeListings'), key: 'activeListings' },
    { label: t('products.lowStock'), key: 'lowStock' },
    { label: t('products.outOfStock'), key: 'outOfStock' },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {CARD_DEFS.map(({ label, key }) => (
        <Card key={key} className="border border-border p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {isLoading || !stats ? '—' : stats[key]}
          </p>
        </Card>
      ))}
    </div>
  );
}
