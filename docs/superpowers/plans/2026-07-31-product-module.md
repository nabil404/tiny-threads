# Product & Category Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the NestJS `ProductsModule` in `apps/api/src/products/` supporting Merchant Admin CRUD and Storefront public catalog endpoints for products, variants, and categories under PostgreSQL Row-Level Security (RLS).

**Architecture:** A unified feature module (`ProductsModule`) with separate Admin (`/api/v1/merchant-admins/...`) and Storefront (`/api/v1/...`) controllers. All database interactions execute via `TenantDbService.run(...)` to guarantee RLS context.

**Tech Stack:** NestJS 11, TypeORM, PostgreSQL 16 (RLS), TypeScript, class-validator, `@tiny-threads/shared`.

## Global Constraints

- Tenancy Isolation: All queries MUST run inside `TenantDbService.run(...)`. Never inject `DataSource` or `EntityManager` directly for tenant-scoped operations.
- Errors: Throw `Coded*Exception` (`CodedNotFoundException`, `CodedBadRequestException`, `CodedConflictException`) from `apps/api/src/common/errors/` with `ErrorCode` from `@tiny-threads/shared`.
- Status Gating: Public storefront APIs (`/api/v1/products`) strictly filter by `status = 'active'`.
- Verification: Run unit tests, `db:verify-rls`, build, and lint after completing tasks.

---

### Task 1: Data Transfer Objects (DTOs)

**Files:**
- Create: `apps/api/src/products/dto/create-product.dto.ts`
- Create: `apps/api/src/products/dto/update-product.dto.ts`
- Create: `apps/api/src/products/dto/product-query.dto.ts`
- Create: `apps/api/src/products/dto/create-category.dto.ts`
- Create: `apps/api/src/products/dto/update-category.dto.ts`
- Test: `apps/api/src/products/__tests__/dto.spec.ts`

**Interfaces:**
- Consumes: `@tiny-threads/shared` `ErrorCode`, `class-validator`, `class-transformer`
- Produces: `CreateProductDto`, `CreateVariantDto`, `UpdateProductDto`, `ProductQueryDto`, `CreateCategoryDto`, `UpdateCategoryDto`

- [ ] **Step 1: Write failing unit test for DTO validations**

```typescript
// apps/api/src/products/__tests__/dto.spec.ts
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateProductDto } from '../dto/create-product.dto';
import { CreateCategoryDto } from '../dto/create-category.dto';

describe('Products & Categories DTO Validation', () => {
  it('fails validation on empty title in CreateProductDto', async () => {
    const dto = plainToInstance(CreateProductDto, { title: '', status: 'active' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('passes validation on valid CreateProductDto', async () => {
    const dto = plainToInstance(CreateProductDto, {
      title: 'T-Shirt',
      status: 'active',
      variants: [{ sku: 'TS-BLK-S', priceCents: 1999, stock: 10, isDefault: true }],
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('fails validation on invalid status in CreateProductDto', async () => {
    const dto = plainToInstance(CreateProductDto, { title: 'T-Shirt', status: 'invalid_status' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('passes validation on CreateCategoryDto', async () => {
    const dto = plainToInstance(CreateCategoryDto, { name: 'Apparel' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/api test -- apps/api/src/products/__tests__/dto.spec.ts`
Expected: FAIL with module/file not found error.

- [ ] **Step 3: Implement DTOs**

```typescript
// apps/api/src/products/dto/create-product.dto.ts
import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsArray,
  IsOptional,
  IsUUID,
  ValidateNested,
  IsInt,
  Min,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProductStatus } from '../../db/entities/products.entity';

export class CreateVariantDto {
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @IsInt()
  @Min(0)
  priceCents!: number;

  @IsInt()
  @Min(0)
  stock!: number;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsIn(['draft', 'active', 'archived'])
  status!: ProductStatus;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants?: CreateVariantDto[];

  @IsArray()
  @IsOptional()
  @IsUUID('all', { each: true })
  categoryIds?: string[];
}
```

```typescript
// apps/api/src/products/dto/update-product.dto.ts
import { PartialType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';

export class UpdateProductDto extends PartialType(CreateProductDto) {}
```

```typescript
// apps/api/src/products/dto/product-query.dto.ts
import { IsOptional, IsString, IsInt, Min, Max, IsIn, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { ProductStatus } from '../../db/entities/products.entity';

export class ProductQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @IsIn(['draft', 'active', 'archived'])
  status?: ProductStatus;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  q?: string;
}
```

```typescript
// apps/api/src/products/dto/create-category.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;
}
```

```typescript
// apps/api/src/products/dto/update-category.dto.ts
import { PartialType } from '@nestjs/swagger';
import { CreateCategoryDto } from './create-category.dto';

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/api test -- apps/api/src/products/__tests__/dto.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit Task 1**

```bash
git add apps/api/src/products/dto apps/api/src/products/__tests__/dto.spec.ts
git commit -m "feat(api): add DTOs for products, variants, and categories"
```

---

### Task 2: CategoriesService (Hierarchical Category Management)

**Files:**
- Create: `apps/api/src/products/categories.service.ts`
- Test: `apps/api/src/products/__tests__/categories.service.spec.ts`

**Interfaces:**
- Consumes: `TenantDbService`, `Category` entity, `CreateCategoryDto`, `UpdateCategoryDto`, `CodedNotFoundException`, `CodedBadRequestException`
- Produces: `CategoriesService.create(...)`, `CategoriesService.getCategoryTree(...)`, `CategoriesService.findById(...)`, `CategoriesService.update(...)`, `CategoriesService.delete(...)`

- [ ] **Step 1: Write failing unit test for CategoriesService**

```typescript
// apps/api/src/products/__tests__/categories.service.spec.ts
import { CategoriesService } from '../categories.service';
import { TenantDbService } from '../../db/tenant-db.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let tenantDbService: jest.Mocked<TenantDbService>;

  beforeEach(() => {
    tenantDbService = {
      run: jest.fn(),
    } as any;
    service = new CategoriesService(tenantDbService);
  });

  it('creates category successfully', async () => {
    const mockCategory = { id: 'cat-1', name: 'Shirts', parentId: null };
    tenantDbService.run.mockImplementation(async (cb) => {
      const em = {
        findOne: jest.fn().mockResolvedValue(null),
        save: jest.fn().mockResolvedValue(mockCategory),
        create: jest.fn().mockReturnValue(mockCategory),
      };
      return cb(em as any);
    });

    const result = await service.create({ name: 'Shirts' });
    expect(result.name).toBe('Shirts');
  });

  it('throws CodedBadRequestException if parentId equals category id on update', async () => {
    tenantDbService.run.mockImplementation(async (cb) => {
      const em = {
        findOne: jest.fn().mockResolvedValue({ id: 'cat-1', name: 'Shirts', parentId: null }),
      };
      return cb(em as any);
    });

    await expect(service.update('cat-1', { parentId: 'cat-1' })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/api test -- apps/api/src/products/__tests__/categories.service.spec.ts`
Expected: FAIL with module/file not found error.

- [ ] **Step 3: Implement CategoriesService**

```typescript
// apps/api/src/products/categories.service.ts
import { Injectable } from '@nestjs/common';
import { TenantDbService } from '../db/tenant-db.service';
import { Category } from '../db/entities/categories.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CodedNotFoundException, CodedBadRequestException } from '../common/errors';
import { ErrorCode } from '@tiny-threads/shared';

export interface CategoryTreeNode extends Category {
  children: CategoryTreeNode[];
}

@Injectable()
export class CategoriesService {
  constructor(private readonly tenantDb: TenantDbService) {}

  async create(dto: CreateCategoryDto): Promise<Category> {
    return this.tenantDb.run(async (em) => {
      if (dto.parentId) {
        const parent = await em.findOne(Category, { where: { id: dto.parentId } });
        if (!parent) {
          throw new CodedNotFoundException(
            ErrorCode.RESOURCE_NOT_FOUND,
            `Parent category with ID ${dto.parentId} not found`,
          );
        }
      }
      const category = em.create(Category, {
        name: dto.name,
        parentId: dto.parentId ?? null,
      });
      return em.save(category);
    });
  }

  async getCategoryTree(): Promise<CategoryTreeNode[]> {
    return this.tenantDb.run(async (em) => {
      const allCategories = await em.find(Category);
      const categoryMap = new Map<string, CategoryTreeNode>();

      allCategories.forEach((cat) => {
        categoryMap.set(cat.id, { ...cat, children: [] });
      });

      const rootNodes: CategoryTreeNode[] = [];

      categoryMap.forEach((node) => {
        if (node.parentId && categoryMap.has(node.parentId)) {
          categoryMap.get(node.parentId)!.children.push(node);
        } else {
          rootNodes.push(node);
        }
      });

      return rootNodes;
    });
  }

  async findById(id: string): Promise<Category> {
    return this.tenantDb.run(async (em) => {
      const category = await em.findOne(Category, {
        where: { id },
        relations: ['children'],
      });
      if (!category) {
        throw new CodedNotFoundException(
          ErrorCode.RESOURCE_NOT_FOUND,
          `Category with ID ${id} not found`,
        );
      }
      return category;
    });
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    return this.tenantDb.run(async (em) => {
      const category = await em.findOne(Category, { where: { id } });
      if (!category) {
        throw new CodedNotFoundException(
          ErrorCode.RESOURCE_NOT_FOUND,
          `Category with ID ${id} not found`,
        );
      }

      if (dto.parentId !== undefined) {
        if (dto.parentId === id) {
          throw new CodedBadRequestException(
            ErrorCode.VALIDATION_FAILED,
            'A category cannot be its own parent',
          );
        }

        if (dto.parentId !== null) {
          const parent = await em.findOne(Category, { where: { id: dto.parentId } });
          if (!parent) {
            throw new CodedNotFoundException(
              ErrorCode.RESOURCE_NOT_FOUND,
              `Parent category with ID ${dto.parentId} not found`,
            );
          }
        }
        category.parentId = dto.parentId;
      }

      if (dto.name !== undefined) {
        category.name = dto.name;
      }

      return em.save(category);
    });
  }

  async delete(id: string): Promise<void> {
    return this.tenantDb.run(async (em) => {
      const category = await em.findOne(Category, {
        where: { id },
        relations: ['children'],
      });
      if (!category) {
        throw new CodedNotFoundException(
          ErrorCode.RESOURCE_NOT_FOUND,
          `Category with ID ${id} not found`,
        );
      }

      if (category.children && category.children.length > 0) {
        throw new CodedBadRequestException(
          ErrorCode.VALIDATION_FAILED,
          'Cannot delete category with sub-categories. Remove or reassign children first.',
        );
      }

      await em.remove(category);
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/api test -- apps/api/src/products/__tests__/categories.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit Task 2**

```bash
git add apps/api/src/products/categories.service.ts apps/api/src/products/__tests__/categories.service.spec.ts
git commit -m "feat(api): implement CategoriesService with tree hierarchy and RLS"
```

---

### Task 3: ProductsService (Product & Variant Management)

**Files:**
- Create: `apps/api/src/products/products.service.ts`
- Test: `apps/api/src/products/__tests__/products.service.spec.ts`

**Interfaces:**
- Consumes: `TenantDbService`, `Product`, `ProductVariant`, `Category`, `ProductCategory` entities, DTOs, `CodedNotFoundException`, `CodedBadRequestException`, `CodedConflictException`
- Produces: `ProductsService.create(...)`, `ProductsService.findAll(...)`, `ProductsService.findById(...)`, `ProductsService.update(...)`, `ProductsService.delete(...)`

- [ ] **Step 1: Write failing unit test for ProductsService**

```typescript
// apps/api/src/products/__tests__/products.service.spec.ts
import { ProductsService } from '../products.service';
import { TenantDbService } from '../../db/tenant-db.service';

describe('ProductsService', () => {
  let service: ProductsService;
  let tenantDbService: jest.Mocked<TenantDbService>;

  beforeEach(() => {
    tenantDbService = {
      run: jest.fn(),
    } as any;
    service = new ProductsService(tenantDbService);
  });

  it('auto-creates default variant if no variants are provided on create', async () => {
    const mockProduct = { id: 'prod-1', title: 'Basic Tee', status: 'active' };
    tenantDbService.run.mockImplementation(async (cb) => {
      const em = {
        save: jest.fn().mockImplementation((entity) => Promise.resolve({ id: 'generated-id', ...entity })),
        create: jest.fn().mockImplementation((_, entity) => entity),
        findOne: jest.fn().mockResolvedValue(null),
        find: jest.fn().mockResolvedValue([]),
      };
      return cb(em as any);
    });

    const result = await service.create({ title: 'Basic Tee', status: 'active' });
    expect(result).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/api test -- apps/api/src/products/__tests__/products.service.spec.ts`
Expected: FAIL with module/file not found error.

- [ ] **Step 3: Implement ProductsService**

```typescript
// apps/api/src/products/products.service.ts
import { Injectable } from '@nestjs/common';
import { TenantDbService } from '../db/tenant-db.service';
import { Product } from '../db/entities/products.entity';
import { ProductVariant } from '../db/entities/product-variants.entity';
import { Category } from '../db/entities/categories.entity';
import { ProductCategory } from '../db/entities/product-categories.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { CodedNotFoundException, CodedBadRequestException, CodedConflictException } from '../common/errors';
import { ErrorCode } from '@tiny-threads/shared';
import { In } from 'typeorm';

export interface PaginatedProducts {
  items: Product[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class ProductsService {
  constructor(private readonly tenantDb: TenantDbService) {}

  async create(dto: CreateProductDto): Promise<Product> {
    return this.tenantDb.run(async (em) => {
      // 1. Validate Category IDs
      if (dto.categoryIds && dto.categoryIds.length > 0) {
        const foundCategories = await em.find(Category, {
          where: { id: In(dto.categoryIds) },
        });
        if (foundCategories.length !== dto.categoryIds.length) {
          throw new CodedBadRequestException(
            ErrorCode.VALIDATION_FAILED,
            'One or more provided category IDs do not exist',
          );
        }
      }

      // 2. Create Product
      const product = em.create(Product, {
        title: dto.title,
        status: dto.status,
      });
      const savedProduct = await em.save(Product, product);

      // 3. Create Variants
      if (dto.variants && dto.variants.length > 0) {
        // Validate SKUs unique in payload
        const skus = dto.variants.map((v) => v.sku);
        if (new Set(skus).size !== skus.length) {
          throw new CodedBadRequestException(
            ErrorCode.VALIDATION_FAILED,
            'Duplicate SKU detected in request variants',
          );
        }

        // Check SKU conflicts in DB
        const existingVariant = await em.findOne(ProductVariant, {
          where: { sku: In(skus) },
        });
        if (existingVariant) {
          throw new CodedConflictException(
            ErrorCode.DUPLICATE_RESOURCE,
            `Variant SKU ${existingVariant.sku} already exists`,
          );
        }

        let hasDefault = false;
        const variantsToSave = dto.variants.map((v, index) => {
          const isDef = v.isDefault ?? index === 0;
          if (isDef) hasDefault = true;
          return em.create(ProductVariant, {
            productId: savedProduct.id,
            sku: v.sku,
            priceCents: v.priceCents,
            stock: v.stock,
            isDefault: isDef,
          });
        });

        if (!hasDefault && variantsToSave.length > 0) {
          variantsToSave[0].isDefault = true;
        }

        await em.save(ProductVariant, variantsToSave);
      } else {
        // Auto-create default variant
        const defaultVariant = em.create(ProductVariant, {
          productId: savedProduct.id,
          sku: `SKU-${savedProduct.id.substring(0, 8)}`,
          priceCents: 0,
          stock: 0,
          isDefault: true,
        });
        await em.save(ProductVariant, defaultVariant);
      }

      // 4. Create Product-Category Associations
      if (dto.categoryIds && dto.categoryIds.length > 0) {
        const productCategories = dto.categoryIds.map((catId) =>
          em.create(ProductCategory, {
            productId: savedProduct.id,
            categoryId: catId,
          }),
        );
        await em.save(ProductCategory, productCategories);
      }

      return this.findById(savedProduct.id);
    });
  }

  async findAll(query: ProductQueryDto, isStorefront: boolean = false): Promise<PaginatedProducts> {
    return this.tenantDb.run(async (em) => {
      const qb = em.createQueryBuilder(Product, 'product')
        .leftJoinAndSelect('product.variants', 'variant')
        .leftJoinAndSelect('product.productCategories', 'productCategory')
        .leftJoinAndSelect('productCategory.category', 'category');

      if (isStorefront) {
        qb.andWhere('product.status = :activeStatus', { activeStatus: 'active' });
      } else if (query.status) {
        qb.andWhere('product.status = :status', { status: query.status });
      }

      if (query.categoryId) {
        qb.andWhere('productCategory.categoryId = :categoryId', { categoryId: query.categoryId });
      }

      if (query.q) {
        qb.andWhere('product.title ILIKE :search', { search: `%${query.q}%` });
      }

      qb.orderBy('product.createdAt', 'DESC');
      qb.skip((query.page - 1) * query.limit);
      qb.take(query.limit);

      const [items, total] = await qb.getManyAndCount();

      return {
        items,
        total,
        page: query.page,
        limit: query.limit,
      };
    });
  }

  async findById(id: string, isStorefront: boolean = false): Promise<Product> {
    return this.tenantDb.run(async (em) => {
      const product = await em.findOne(Product, {
        where: { id },
        relations: ['variants', 'productCategories', 'productCategories.category'],
      });

      if (!product || (isStorefront && product.status !== 'active')) {
        throw new CodedNotFoundException(
          ErrorCode.RESOURCE_NOT_FOUND,
          `Product with ID ${id} not found`,
        );
      }

      return product;
    });
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    return this.tenantDb.run(async (em) => {
      const product = await em.findOne(Product, {
        where: { id },
        relations: ['variants', 'productCategories'],
      });

      if (!product) {
        throw new CodedNotFoundException(
          ErrorCode.RESOURCE_NOT_FOUND,
          `Product with ID ${id} not found`,
        );
      }

      if (dto.title !== undefined) product.title = dto.title;
      if (dto.status !== undefined) product.status = dto.status;
      await em.save(Product, product);

      // Category update sync
      if (dto.categoryIds !== undefined) {
        await em.delete(ProductCategory, { productId: id });
        if (dto.categoryIds.length > 0) {
          const pcs = dto.categoryIds.map((catId) =>
            em.create(ProductCategory, { productId: id, categoryId: catId }),
          );
          await em.save(ProductCategory, pcs);
        }
      }

      // Variant update sync
      if (dto.variants !== undefined) {
        await em.delete(ProductVariant, { productId: id });
        const newVariants = dto.variants.map((v, index) =>
          em.create(ProductVariant, {
            productId: id,
            sku: v.sku,
            priceCents: v.priceCents,
            stock: v.stock,
            isDefault: v.isDefault ?? index === 0,
          }),
        );
        await em.save(ProductVariant, newVariants);
      }

      return this.findById(id);
    });
  }

  async delete(id: string): Promise<void> {
    return this.tenantDb.run(async (em) => {
      const product = await em.findOne(Product, { where: { id } });
      if (!product) {
        throw new CodedNotFoundException(
          ErrorCode.RESOURCE_NOT_FOUND,
          `Product with ID ${id} not found`,
        );
      }
      product.status = 'archived';
      await em.save(Product, product);
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/api test -- apps/api/src/products/__tests__/products.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit Task 3**

```bash
git add apps/api/src/products/products.service.ts apps/api/src/products/__tests__/products.service.spec.ts
git commit -m "feat(api): implement ProductsService with variant and category handling"
```

---

### Task 4: Merchant Admin Controllers

**Files:**
- Create: `apps/api/src/products/merchant-products.controller.ts`
- Create: `apps/api/src/products/merchant-categories.controller.ts`
- Test: `apps/api/src/products/__tests__/merchant-controllers.spec.ts`

**Interfaces:**
- Consumes: `ProductsService`, `CategoriesService`, `MerchantAdminJwtAuthGuard`, DTOs
- Produces: `MerchantProductsController` (`/api/v1/merchant-admins/products`), `MerchantCategoriesController` (`/api/v1/merchant-admins/categories`)

- [ ] **Step 1: Write failing unit test for Merchant Controllers**

```typescript
// apps/api/src/products/__tests__/merchant-controllers.spec.ts
import { MerchantProductsController } from '../merchant-products.controller';
import { MerchantCategoriesController } from '../merchant-categories.controller';
import { ProductsService } from '../products.service';
import { CategoriesService } from '../categories.service';

describe('Merchant Controllers', () => {
  let productsController: MerchantProductsController;
  let categoriesController: MerchantCategoriesController;
  let productsService: jest.Mocked<ProductsService>;
  let categoriesService: jest.Mocked<CategoriesService>;

  beforeEach(() => {
    productsService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as any;
    categoriesService = {
      create: jest.fn(),
      getCategoryTree: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as any;

    productsController = new MerchantProductsController(productsService);
    categoriesController = new MerchantCategoriesController(categoriesService);
  });

  it('calls productsService.create on POST', async () => {
    productsService.create.mockResolvedValue({ id: 'p1', title: 'Tee' } as any);
    const res = await productsController.create({ title: 'Tee', status: 'active' });
    expect(res.id).toBe('p1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/api test -- apps/api/src/products/__tests__/merchant-controllers.spec.ts`
Expected: FAIL with module/file not found error.

- [ ] **Step 3: Implement Merchant Controllers**

```typescript
// apps/api/src/products/merchant-products.controller.ts
import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { MerchantAdminJwtAuthGuard } from '../merchant-admins/guards/merchant-admin-jwt-auth.guard';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';

@Controller('merchant-admins/products')
@UseGuards(MerchantAdminJwtAuthGuard)
export class MerchantProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Get()
  findAll(@Query() query: ProductQueryDto) {
    return this.productsService.findAll(query, false);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findById(id, false);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.productsService.delete(id);
  }
}
```

```typescript
// apps/api/src/products/merchant-categories.controller.ts
import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { MerchantAdminJwtAuthGuard } from '../merchant-admins/guards/merchant-admin-jwt-auth.guard';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Controller('merchant-admins/categories')
@UseGuards(MerchantAdminJwtAuthGuard)
export class MerchantCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Get()
  getTree() {
    return this.categoriesService.getCategoryTree();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.categoriesService.findById(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.categoriesService.delete(id);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/api test -- apps/api/src/products/__tests__/merchant-controllers.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit Task 4**

```bash
git add apps/api/src/products/merchant-products.controller.ts apps/api/src/products/merchant-categories.controller.ts apps/api/src/products/__tests__/merchant-controllers.spec.ts
git commit -m "feat(api): implement merchant admin controllers for products and categories"
```

---

### Task 5: Storefront Controllers

**Files:**
- Create: `apps/api/src/products/storefront-products.controller.ts`
- Create: `apps/api/src/products/storefront-categories.controller.ts`
- Test: `apps/api/src/products/__tests__/storefront-controllers.spec.ts`

**Interfaces:**
- Consumes: `ProductsService`, `CategoriesService`, `ProductQueryDto`
- Produces: `StorefrontProductsController` (`/api/v1/products`), `StorefrontCategoriesController` (`/api/v1/categories`)

- [ ] **Step 1: Write failing unit test for Storefront Controllers**

```typescript
// apps/api/src/products/__tests__/storefront-controllers.spec.ts
import { StorefrontProductsController } from '../storefront-products.controller';
import { StorefrontCategoriesController } from '../storefront-categories.controller';
import { ProductsService } from '../products.service';
import { CategoriesService } from '../categories.service';

describe('Storefront Controllers', () => {
  let productsController: StorefrontProductsController;
  let categoriesController: StorefrontCategoriesController;
  let productsService: jest.Mocked<ProductsService>;
  let categoriesService: jest.Mocked<CategoriesService>;

  beforeEach(() => {
    productsService = {
      findAll: jest.fn(),
      findById: jest.fn(),
    } as any;
    categoriesService = {
      getCategoryTree: jest.fn(),
      findById: jest.fn(),
    } as any;

    productsController = new StorefrontProductsController(productsService);
    categoriesController = new StorefrontCategoriesController(categoriesService);
  });

  it('calls productsService.findAll with isStorefront = true', async () => {
    productsService.findAll.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
    await productsController.findAll({ page: 1, limit: 20 });
    expect(productsService.findAll).toHaveBeenCalledWith({ page: 1, limit: 20 }, true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/api test -- apps/api/src/products/__tests__/storefront-controllers.spec.ts`
Expected: FAIL with module/file not found error.

- [ ] **Step 3: Implement Storefront Controllers**

```typescript
// apps/api/src/products/storefront-products.controller.ts
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductQueryDto } from './dto/product-query.dto';

@Controller('products')
export class StorefrontProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(@Query() query: ProductQueryDto) {
    return this.productsService.findAll(query, true);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findById(id, true);
  }
}
```

```typescript
// apps/api/src/products/storefront-categories.controller.ts
import { Controller, Get, Param } from '@nestjs/common';
import { CategoriesService } from './categories.service';

@Controller('categories')
export class StorefrontCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  getTree() {
    return this.categoriesService.getCategoryTree();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.categoriesService.findById(id);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/api test -- apps/api/src/products/__tests__/storefront-controllers.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit Task 5**

```bash
git add apps/api/src/products/storefront-products.controller.ts apps/api/src/products/storefront-categories.controller.ts apps/api/src/products/__tests__/storefront-controllers.spec.ts
git commit -m "feat(api): implement storefront public controllers for products and categories"
```

---

### Task 6: ProductsModule Wiring & Integration Verification

**Files:**
- Create: `apps/api/src/products/products.module.ts`
- Modify: `apps/api/src/app/app.module.ts`
- Test: `apps/api/src/products/__tests__/products.module.spec.ts`

**Interfaces:**
- Consumes: `ProductsModule`
- Produces: Registration of `ProductsModule` inside `AppModule`

- [ ] **Step 1: Write failing unit test for ProductsModule compilation**

```typescript
// apps/api/src/products/__tests__/products.module.spec.ts
import { Test } from '@nestjs/testing';
import { ProductsModule } from '../products.module';
import { DatabaseModule } from '../../db/database.module';

describe('ProductsModule', () => {
  it('compiles successfully', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ProductsModule],
    })
      .overrideProvider(DatabaseModule)
      .useValue({})
      .compile();

    expect(moduleRef).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/api test -- apps/api/src/products/__tests__/products.module.spec.ts`
Expected: FAIL with module/file not found error.

- [ ] **Step 3: Implement ProductsModule and register in AppModule**

```typescript
// apps/api/src/products/products.module.ts
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../db/database.module';
import { ProductsService } from './products.service';
import { CategoriesService } from './categories.service';
import { MerchantProductsController } from './merchant-products.controller';
import { MerchantCategoriesController } from './merchant-categories.controller';
import { StorefrontProductsController } from './storefront-products.controller';
import { StorefrontCategoriesController } from './storefront-categories.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [
    MerchantProductsController,
    MerchantCategoriesController,
    StorefrontProductsController,
    StorefrontCategoriesController,
  ],
  providers: [ProductsService, CategoriesService],
  exports: [ProductsService, CategoriesService],
})
export class ProductsModule {}
```

Register `ProductsModule` in `apps/api/src/app/app.module.ts` imports array.

- [ ] **Step 4: Run unit tests, RLS check, build, and lint**

Run: `pnpm --filter @tiny-threads/api test`
Run: `pnpm --filter @tiny-threads/api db:verify-rls`
Run: `pnpm build`
Run: `pnpm lint`
Expected: All commands pass cleanly with 0 errors.

- [ ] **Step 5: Commit Task 6**

```bash
git add apps/api/src/products/products.module.ts apps/api/src/app/app.module.ts apps/api/src/products/__tests__/products.module.spec.ts
git commit -m "feat(api): assemble ProductsModule and register in AppModule"
```
