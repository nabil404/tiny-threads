import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@components/ui/card';
import { Package } from 'lucide-react';

export function ProductsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Products</h1>
        <p className="text-sm text-muted-foreground">
          Manage your store inventory, variants, and product catalog.
        </p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            <span>Product Catalog</span>
          </CardTitle>
          <CardDescription>
            Product management module integration ready.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-8 text-center border border-dashed border-border rounded-lg text-muted-foreground text-sm">
            Product catalog management will be connected in upcoming features.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
