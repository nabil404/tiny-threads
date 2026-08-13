import { z } from 'zod';
import type { JSONContent } from '@tiptap/react';

export const variantFormSchema = z.object({
  id: z.string().uuid().optional(),
  clientKey: z.string(),
  name: z.string().max(255).optional().default(''),
  sku: z.string().min(1, 'SKU is required').max(100),
  priceDollars: z.coerce
    .number({ message: 'Price must be a number' })
    .min(0, 'Price must be ≥ 0'),
  stock: z.coerce
    .number({ message: 'Stock must be a number' })
    .int('Stock must be a whole number')
    .min(0, 'Stock must be ≥ 0'),
  isDefault: z.boolean().default(false),
});

export const productFormSchema = z.object({
  title: z.string().min(1, 'Product name is required'),
  description: z.custom<JSONContent>().optional(),
  status: z.enum(['draft', 'active', 'archived']),
  categoryIds: z.array(z.string().uuid()).default([]),
  variants: z
    .array(variantFormSchema)
    .min(1, 'At least one variant is required'),
});

export type VariantFormData = z.infer<typeof variantFormSchema>;
export type ProductFormData = z.infer<typeof productFormSchema>;

/** Convert cents from API → dollars for form display */
export function priceCentsToDollars(cents: number): number {
  return cents / 100;
}

/** Convert dollars from form → cents for API submission */
export function priceDollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}
