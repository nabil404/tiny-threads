import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateProductDto } from '../dto/create-product.dto';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { ProductQueryDto } from '../dto/product-query.dto';

describe('Products & Categories DTO Validation', () => {
  it('fails validation on empty title in CreateProductDto', async () => {
    const dto = plainToInstance(CreateProductDto, {
      title: '',
      status: 'active',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('passes validation on valid CreateProductDto', async () => {
    const dto = plainToInstance(CreateProductDto, {
      title: 'T-Shirt',
      status: 'active',
      variants: [
        { sku: 'TS-BLK-S', priceCents: 1999, stock: 10, isDefault: true },
      ],
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('fails validation on invalid status in CreateProductDto', async () => {
    const dto = plainToInstance(CreateProductDto, {
      title: 'T-Shirt',
      status: 'invalid_status',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('passes validation on CreateCategoryDto', async () => {
    const dto = plainToInstance(CreateCategoryDto, { name: 'Apparel' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('passes validation on ProductQueryDto with defaults and custom values', async () => {
    const dto = plainToInstance(ProductQueryDto, {
      page: 2,
      limit: 10,
      status: 'draft',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(10);
  });
});
