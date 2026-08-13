import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@components/ui/card';
import { ShoppingCart } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function OrdersPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('orders.pageTitle')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('orders.pageDescription')}
        </p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            <span>{t('orders.fulfillmentTitle')}</span>
          </CardTitle>
          <CardDescription>
            {t('orders.fulfillmentDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-8 text-center border border-dashed border-border rounded-lg text-muted-foreground text-sm">
            {t('orders.comingSoon')}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
