import { priceCentsToDollars } from '@features/products/schemas/product-form.schema';

export function formatCurrency(cents: number, symbol: string): string {
  return `${symbol}${priceCentsToDollars(cents).toFixed(2)}`;
}
