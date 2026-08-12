import { describe, it, expect } from 'vitest';
import {
  productFormSchema,
  priceCentsToDollars,
  priceDollarsToCents,
} from '../product-form.schema';

describe('productFormSchema', () => {
  const validProduct = {
    title: 'Test T-Shirt',
    description: 'A comfortable t-shirt',
    status: 'active' as const,
    categoryIds: ['123e4567-e89b-12d3-a456-426614174000'],
    variants: [
      {
        sku: 'TSHIRT-RED-S',
        priceDollars: 19.99,
        stock: 50,
        isDefault: true,
      },
    ],
  };

  it('validates a correct product form payload', () => {
    const result = productFormSchema.safeParse(validProduct);
    expect(result.success).toBe(true);
  });

  it('fails if title is empty', () => {
    const result = productFormSchema.safeParse({
      ...validProduct,
      title: '',
    });
    expect(result.success).toBe(false);
  });

  it('fails if variants array is empty', () => {
    const result = productFormSchema.safeParse({
      ...validProduct,
      variants: [],
    });
    expect(result.success).toBe(false);
  });

  it('fails if price is negative', () => {
    const result = productFormSchema.safeParse({
      ...validProduct,
      variants: [
        {
          sku: 'TSHIRT-RED-S',
          priceDollars: -5,
          stock: 10,
          isDefault: true,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('fails if stock is not a whole number', () => {
    const result = productFormSchema.safeParse({
      ...validProduct,
      variants: [
        {
          sku: 'TSHIRT-RED-S',
          priceDollars: 10,
          stock: 3.5,
          isDefault: true,
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe('Price helpers', () => {
  it('converts cents to dollars accurately', () => {
    expect(priceCentsToDollars(1999)).toBe(19.99);
    expect(priceCentsToDollars(0)).toBe(0);
    expect(priceCentsToDollars(1500)).toBe(15);
  });

  it('converts dollars to cents accurately', () => {
    expect(priceDollarsToCents(19.99)).toBe(1999);
    expect(priceDollarsToCents(0)).toBe(0);
    expect(priceDollarsToCents(15)).toBe(1500);
    expect(priceDollarsToCents(10.005)).toBe(1001); // rounds correctly
  });
});
