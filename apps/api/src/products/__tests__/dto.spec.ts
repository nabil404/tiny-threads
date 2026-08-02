import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateProductDto, CreateVariantDto } from '../dto/create-product.dto';
import { CreateProductVariantDto } from '../dto/create-product-variant.dto';
import { UpdateProductVariantDto } from '../dto/update-product-variant.dto';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { ProductQueryDto } from '../dto/product-query.dto';

function decode(raw: string): {
  code: string;
  params: Record<string, unknown>;
} {
  return JSON.parse(raw);
}

describe('Products & Categories DTO Validation', () => {
  it('fails validation on empty title in CreateProductDto and encodes IS_NOT_EMPTY', async () => {
    const dto = plainToInstance(CreateProductDto, {
      title: '',
      status: 'active',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const byProperty = Object.fromEntries(
      errors.map((e) => [e.property, e.constraints ?? {}]),
    );
    expect(decode(byProperty.title.isNotEmpty)).toMatchObject({
      code: 'IS_NOT_EMPTY',
    });
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

  it('fails validation on invalid status in CreateProductDto and encodes IS_IN', async () => {
    const dto = plainToInstance(CreateProductDto, {
      title: 'T-Shirt',
      status: 'invalid_status',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const byProperty = Object.fromEntries(
      errors.map((e) => [e.property, e.constraints ?? {}]),
    );
    expect(decode(byProperty.status.isIn)).toMatchObject({
      code: 'IS_IN',
    });
  });

  it('encodes error codes for CreateVariantDto fields', async () => {
    const variant = plainToInstance(CreateVariantDto, {
      sku: 'a'.repeat(101),
      priceCents: -5,
      stock: -1,
      isDefault: 'not-a-boolean',
    });
    const errors = await validate(variant);
    const byProperty = Object.fromEntries(
      errors.map((e) => [e.property, e.constraints ?? {}]),
    );
    expect(decode(byProperty.sku.maxLength)).toMatchObject({
      code: 'MAX_LENGTH',
      params: { max: 100 },
    });
    expect(decode(byProperty.priceCents.min)).toMatchObject({
      code: 'MIN',
      params: { min: 0 },
    });
    expect(decode(byProperty.stock.min)).toMatchObject({
      code: 'MIN',
      params: { min: 0 },
    });
    expect(decode(byProperty.isDefault.isBoolean)).toMatchObject({
      code: 'IS_BOOLEAN',
    });
  });

  it('encodes error codes for CreateCategoryDto fields', async () => {
    const dto = plainToInstance(CreateCategoryDto, {
      name: '',
      parentId: 'invalid-uuid',
    });
    const errors = await validate(dto);
    const byProperty = Object.fromEntries(
      errors.map((e) => [e.property, e.constraints ?? {}]),
    );
    expect(decode(byProperty.name.isNotEmpty)).toMatchObject({
      code: 'IS_NOT_EMPTY',
    });
    expect(decode(byProperty.parentId.isUuid)).toMatchObject({
      code: 'IS_UUID',
    });
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

  it('encodes error codes for ProductQueryDto validation errors', async () => {
    const dto = plainToInstance(ProductQueryDto, {
      page: 0,
      limit: 150,
      q: 'a'.repeat(101),
      categoryId: 'bad-uuid',
    });
    const errors = await validate(dto);
    const byProperty = Object.fromEntries(
      errors.map((e) => [e.property, e.constraints ?? {}]),
    );
    expect(decode(byProperty.page.min)).toMatchObject({
      code: 'MIN',
      params: { min: 1 },
    });
    expect(decode(byProperty.limit.max)).toMatchObject({
      code: 'MAX',
      params: { max: 100 },
    });
    expect(decode(byProperty.q.maxLength)).toMatchObject({
      code: 'MAX_LENGTH',
      params: { max: 100 },
    });
    expect(decode(byProperty.categoryId.isUuid)).toMatchObject({
      code: 'IS_UUID',
    });
  });

  describe('CreateProductVariantDto', () => {
    it('passes validation with valid data', async () => {
      const dto = plainToInstance(CreateProductVariantDto, {
        sku: 'TEE-BLK-S',
        priceCents: 2500,
        stock: 100,
        isDefault: false,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('fails validation when required fields are missing or invalid', async () => {
      const dto = plainToInstance(CreateProductVariantDto, {
        sku: '',
        priceCents: -10,
        stock: -5,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('UpdateProductVariantDto', () => {
    it('passes validation when empty or with partial fields', async () => {
      const emptyDto = plainToInstance(UpdateProductVariantDto, {});
      expect(await validate(emptyDto)).toHaveLength(0);

      const partialDto = plainToInstance(UpdateProductVariantDto, {
        priceCents: 2800,
      });
      expect(await validate(partialDto)).toHaveLength(0);
    });

    it('fails validation with invalid negative values', async () => {
      const dto = plainToInstance(UpdateProductVariantDto, {
        priceCents: -1,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
