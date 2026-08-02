# Single Product Variant Endpoints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide granular REST API endpoints under `/api/v1/merchant-admins/products/:productId/variants` for creating, listing, viewing, updating, and deleting individual product variants with RLS tenant isolation and invariant enforcement.

**Architecture:** Extend NestJS `ProductsModule` with `CreateProductVariantDto`, `UpdateProductVariantDto`, new `MerchantProductVariantsController`, and service layer methods in `ProductsService` using `TenantDbService` transactions to enforce default variant auto-swapping/promotion and minimum variant count limits.

**Tech Stack:** NestJS 11, TypeORM 0.3, TypeScript, Jest, Supertest, PostgreSQL 16 (RLS).

## Global Constraints

- Tenancy Isolation: All database operations MUST execute inside `TenantDbService.run(...)`.
- Error Envelope: Throw `Coded*Exception` with `ErrorCode` from `@tiny-threads/shared`.
- Guards & RBAC: Controller uses `MerchantAdminJwtAuthGuard` and `@Roles('owner', 'admin', 'staff')`.
- Code Style: Single quotes, trailing commas, strict TypeScript DTO validations using `class-validator`.

---

## File Structure & Dependencies

- `apps/api/src/products/dto/create-product-variant.dto.ts`: DTO for single variant creation.
- `apps/api/src/products/dto/update-product-variant.dto.ts`: DTO for single variant partial update.
- `apps/api/src/products/services/products.service.ts`: Extended with single-variant domain logic (`createVariant`, `findAllVariantsByProductId`, `findVariantById`, `updateVariant`, `deleteVariant`).
- `apps/api/src/products/controllers/merchant-product-variants.controller.ts`: Controller handling HTTP requests for `/merchant-admins/products/:productId/variants`.
- `apps/api/src/products/products.module.ts`: Registered new controller.
- `apps/api/src/products/__tests__/merchant-product-variants.spec.ts`: Unit/Integration tests for single-variant management.
- `docs/architecture/products-and-categories.md`: Documentation update.

---

### Task 1: Create Single Variant DTOs

**Files:**
- Create: `apps/api/src/products/dto/create-product-variant.dto.ts`
- Create: `apps/api/src/products/dto/update-product-variant.dto.ts`

**Interfaces:**
- Produces: `CreateProductVariantDto` and `UpdateProductVariantDto` for single variant operations.

- [ ] **Step 1: Write `CreateProductVariantDto`**

Create `apps/api/src/products/dto/create-product-variant.dto.ts`:

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  IsBoolean,
  IsOptional,
} from 'class-validator';

export class CreateProductVariantDto {
  @ApiProperty({ description: 'Unique SKU code for the variant', example: 'TEE-BLK-S' })
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @ApiProperty({ description: 'Price in cents', example: 2500 })
  @IsNumber()
  @Min(0)
  priceCents!: number;

  @ApiProperty({ description: 'Available stock quantity', example: 100 })
  @IsNumber()
  @Min(0)
  stock!: number;

  @ApiPropertyOptional({ description: 'Whether this variant is the default for the product', default: false })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
```

- [ ] **Step 2: Write `UpdateProductVariantDto`**

Create `apps/api/src/products/dto/update-product-variant.dto.ts`:

```typescript
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  IsBoolean,
  IsOptional,
} from 'class-validator';

export class UpdateProductVariantDto {
  @ApiPropertyOptional({ description: 'Unique SKU code for the variant', example: 'TEE-BLK-M' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  sku?: string;

  @ApiPropertyOptional({ description: 'Price in cents', example: 2800 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  priceCents?: number;

  @ApiPropertyOptional({ description: 'Available stock quantity', example: 50 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  stock?: number;

  @ApiPropertyOptional({ description: 'Whether this variant is the default for the product' })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
```

- [ ] **Step 3: Commit DTOs**

```bash
git add apps/api/src/products/dto/create-product-variant.dto.ts apps/api/src/products/dto/update-product-variant.dto.ts
git commit -m "feat(api): add CreateProductVariantDto and UpdateProductVariantDto"
```

---

### Task 2: Implement Single-Variant Methods in `ProductsService`

**Files:**
- Modify: `apps/api/src/products/services/products.service.ts`

**Interfaces:**
- Consumes: `CreateProductVariantDto`, `UpdateProductVariantDto`, `TenantDbService`
- Produces: `createVariant()`, `findVariantsByProduct()`, `findVariantById()`, `updateVariant()`, `deleteVariant()` on `ProductsService`

- [ ] **Step 1: Write failing unit test for variant service operations**

Create `apps/api/src/products/__tests__/single-variant-service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from '../services/products.service';
import { TenantDbService } from '../../db/tenant-db.service';
import { ClsService } from 'nestjs-cls';
import { ErrorCode } from '@tiny-threads/shared';
import { CodedNotFoundException, CodedBadRequestException } from '../../common/errors/coded-exceptions';

describe('ProductsService - Single Variant Operations', () => {
  let service: ProductsService;

  beforeEach(async () => {
    const mockTenantDb = {
      run: jest.fn((cb) => cb({
        findOne: jest.fn(),
        find: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        delete: jest.fn(),
        update: jest.fn(),
      })),
    };
    const mockCls = {
      get: jest.fn().mockReturnValue('tenant-123'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: TenantDbService, useValue: mockTenantDb },
        { provide: ClsService, useValue: mockCls },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  it('should be defined', () => {
    expect(service.createVariant).toBeDefined();
    expect(service.findVariantsByProduct).toBeDefined();
    expect(service.findVariantById).toBeDefined();
    expect(service.updateVariant).toBeDefined();
    expect(service.deleteVariant).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/api test -- single-variant-service.spec.ts`
Expected: FAIL (methods not defined on `ProductsService`).

- [ ] **Step 3: Implement single-variant methods in `ProductsService`**

Add the following methods to `ProductsService` in `apps/api/src/products/services/products.service.ts`:

```typescript
  async createVariant(
    productId: string,
    dto: CreateProductVariantDto,
  ): Promise<ProductVariant> {
    return this.tenantDb.run(async (em) => {
      const tenantId = this.cls.get<string>('tenantId');
      const product = await em.findOne(Product, { where: { id: productId } });
      if (!product) {
        throw new CodedNotFoundException(
          ErrorCode.RESOURCE_NOT_FOUND,
          `Product with ID ${productId} not found`,
        );
      }

      // Check SKU uniqueness
      const existingSku = await em.findOne(ProductVariant, {
        where: { sku: dto.sku },
      });
      if (existingSku) {
        throw new CodedConflictException(
          ErrorCode.DUPLICATE_RESOURCE,
          `Variant SKU ${dto.sku} already exists`,
        );
      }

      const isDefault = dto.isDefault ?? false;
      if (isDefault) {
        // Demote existing defaults for this product
        await em.update(
          ProductVariant,
          { productId },
          { isDefault: false },
        );
      }

      const variant = em.create(ProductVariant, {
        tenantId,
        productId,
        sku: dto.sku,
        priceCents: dto.priceCents,
        stock: dto.stock,
        isDefault,
      });

      return this.saveWithUniqueCheck(() => em.save(ProductVariant, variant));
    });
  }

  async findVariantsByProduct(productId: string): Promise<ProductVariant[]> {
    return this.tenantDb.run(async (em) => {
      const product = await em.findOne(Product, { where: { id: productId } });
      if (!product) {
        throw new CodedNotFoundException(
          ErrorCode.RESOURCE_NOT_FOUND,
          `Product with ID ${productId} not found`,
        );
      }

      return em.find(ProductVariant, {
        where: { productId },
        order: { createdAt: 'ASC' },
      });
    });
  }

  async findVariantById(
    productId: string,
    variantId: string,
  ): Promise<ProductVariant> {
    return this.tenantDb.run(async (em) => {
      const variant = await em.findOne(ProductVariant, {
        where: { id: variantId, productId },
      });
      if (!variant) {
        throw new CodedNotFoundException(
          ErrorCode.RESOURCE_NOT_FOUND,
          `Variant with ID ${variantId} not found for product ${productId}`,
        );
      }
      return variant;
    });
  }

  async updateVariant(
    productId: string,
    variantId: string,
    dto: UpdateProductVariantDto,
  ): Promise<ProductVariant> {
    return this.tenantDb.run(async (em) => {
      const variant = await em.findOne(ProductVariant, {
        where: { id: variantId, productId },
      });
      if (!variant) {
        throw new CodedNotFoundException(
          ErrorCode.RESOURCE_NOT_FOUND,
          `Variant with ID ${variantId} not found for product ${productId}`,
        );
      }

      if (dto.sku !== undefined && dto.sku !== variant.sku) {
        const existingSku = await em.findOne(ProductVariant, {
          where: { sku: dto.sku, id: Not(variantId) },
        });
        if (existingSku) {
          throw new CodedConflictException(
            ErrorCode.DUPLICATE_RESOURCE,
            `Variant SKU ${dto.sku} already exists`,
          );
        }
        variant.sku = dto.sku;
      }

      if (dto.priceCents !== undefined) variant.priceCents = dto.priceCents;
      if (dto.stock !== undefined) variant.stock = dto.stock;

      if (dto.isDefault === true && !variant.isDefault) {
        // Demote existing defaults for this product
        await em.update(
          ProductVariant,
          { productId },
          { isDefault: false },
        );
        variant.isDefault = true;
      } else if (dto.isDefault === false && variant.isDefault) {
        // Prevent unsetting default if it is the only default unless another is promoted
        const count = await em.count(ProductVariant, { where: { productId } });
        if (count <= 1) {
          throw new CodedBadRequestException(
            ErrorCode.VALIDATION_FAILED,
            'Product must have at least one default variant',
          );
        }
        variant.isDefault = false;
      }

      return this.saveWithUniqueCheck(() => em.save(ProductVariant, variant));
    });
  }

  async deleteVariant(productId: string, variantId: string): Promise<void> {
    return this.tenantDb.run(async (em) => {
      const variants = await em.find(ProductVariant, {
        where: { productId },
        order: { createdAt: 'ASC' },
      });

      const variantToDelete = variants.find((v) => v.id === variantId);
      if (!variantToDelete) {
        throw new CodedNotFoundException(
          ErrorCode.RESOURCE_NOT_FOUND,
          `Variant with ID ${variantId} not found for product ${productId}`,
        );
      }

      if (variants.length <= 1) {
        throw new CodedBadRequestException(
          ErrorCode.VALIDATION_FAILED,
          'Cannot delete the only variant of a product',
        );
      }

      await em.delete(ProductVariant, { id: variantId, productId });

      // If we deleted the default variant, promote the oldest remaining variant
      if (variantToDelete.isDefault) {
        const remaining = variants.filter((v) => v.id !== variantId);
        if (remaining.length > 0) {
          await em.update(
            ProductVariant,
            { id: remaining[0].id },
            { isDefault: true },
          );
        }
      }
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/api test -- single-variant-service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit service changes**

```bash
git add apps/api/src/products/services/products.service.ts apps/api/src/products/__tests__/single-variant-service.spec.ts
git commit -m "feat(api): implement single-variant methods in ProductsService"
```

---

### Task 3: Create `MerchantProductVariantsController` and Register in Module

**Files:**
- Create: `apps/api/src/products/controllers/merchant-product-variants.controller.ts`
- Modify: `apps/api/src/products/products.module.ts`

**Interfaces:**
- Consumes: `ProductsService`, `CreateProductVariantDto`, `UpdateProductVariantDto`
- Produces: `MerchantProductVariantsController` REST routes

- [ ] **Step 1: Create `MerchantProductVariantsController`**

Create `apps/api/src/products/controllers/merchant-product-variants.controller.ts`:

```typescript
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { MerchantAdminJwtAuthGuard } from '../../merchant-admins/guards/merchant-admin-jwt-auth.guard';
import { RolesGuard } from '../../merchant-admins/guards/roles.guard';
import { Roles } from '../../merchant-admins/decorators/roles.decorator';
import { ProductsService } from '../services/products.service';
import { CreateProductVariantDto } from '../dto/create-product-variant.dto';
import { UpdateProductVariantDto } from '../dto/update-product-variant.dto';

@ApiTags('Merchant Product Variants')
@ApiBearerAuth()
@Controller('merchant-admins/products/:productId/variants')
@UseGuards(MerchantAdminJwtAuthGuard)
export class MerchantProductVariantsController {
  constructor(private readonly productsService: ProductsService) {}

  @ApiOperation({
    summary: 'Add variant to product',
    description: 'Creates a new variant under the specified product.',
  })
  @ApiResponse({ status: 201, description: 'Variant created successfully.' })
  @ApiResponse({ status: 404, description: 'Product not found.' })
  @ApiResponse({ status: 409, description: 'SKU already exists.' })
  @UseGuards(MerchantAdminJwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Post()
  create(
    @Param('productId') productId: string,
    @Body() dto: CreateProductVariantDto,
  ) {
    return this.productsService.createVariant(productId, dto);
  }

  @ApiOperation({
    summary: 'List product variants',
    description: 'Retrieves all variants belonging to the specified product.',
  })
  @ApiResponse({ status: 200, description: 'List of variants.' })
  @ApiResponse({ status: 404, description: 'Product not found.' })
  @Get()
  findAll(@Param('productId') productId: string) {
    return this.productsService.findVariantsByProduct(productId);
  }

  @ApiOperation({
    summary: 'Get single variant',
    description: 'Retrieves a single product variant by ID.',
  })
  @ApiResponse({ status: 200, description: 'Variant found.' })
  @ApiResponse({ status: 404, description: 'Variant not found.' })
  @Get(':variantId')
  findOne(
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
  ) {
    return this.productsService.findVariantById(productId, variantId);
  }

  @ApiOperation({
    summary: 'Update single variant',
    description: 'Updates price, stock, SKU, or default status of a single variant.',
  })
  @ApiResponse({ status: 200, description: 'Variant updated successfully.' })
  @ApiResponse({ status: 404, description: 'Variant not found.' })
  @ApiResponse({ status: 409, description: 'SKU already exists.' })
  @UseGuards(MerchantAdminJwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Patch(':variantId')
  update(
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateProductVariantDto,
  ) {
    return this.productsService.updateVariant(productId, variantId, dto);
  }

  @ApiOperation({
    summary: 'Delete single variant',
    description:
      'Deletes a single variant. Auto-promotes another variant if deleting default variant.',
  })
  @ApiResponse({ status: 204, description: 'Variant deleted successfully.' })
  @ApiResponse({ status: 400, description: 'Cannot delete only variant of product.' })
  @ApiResponse({ status: 404, description: 'Variant not found.' })
  @UseGuards(MerchantAdminJwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Delete(':variantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
  ) {
    await this.productsService.deleteVariant(productId, variantId);
  }
}
```

- [ ] **Step 2: Register controller in `ProductsModule`**

Update `apps/api/src/products/products.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ProductsService } from './services/products.service';
import { CategoriesService } from './services/categories.service';
import { MerchantProductsController } from './controllers/merchant-products.controller';
import { MerchantProductVariantsController } from './controllers/merchant-product-variants.controller';
import { MerchantCategoriesController } from './controllers/merchant-categories.controller';
import { StorefrontProductsController } from './controllers/storefront-products.controller';
import { StorefrontCategoriesController } from './controllers/storefront-categories.controller';

@Module({
  controllers: [
    MerchantProductsController,
    MerchantProductVariantsController,
    MerchantCategoriesController,
    StorefrontProductsController,
    StorefrontCategoriesController,
  ],
  providers: [ProductsService, CategoriesService],
  exports: [ProductsService, CategoriesService],
})
export class ProductsModule {}
```

- [ ] **Step 3: Commit controller and module updates**

```bash
git add apps/api/src/products/controllers/merchant-product-variants.controller.ts apps/api/src/products/products.module.ts
git commit -m "feat(api): add MerchantProductVariantsController and register in ProductsModule"
```

---

### Task 4: E2E / Integration Verification Tests & Documentation Update

**Files:**
- Create: `apps/api/src/products/__tests__/merchant-product-variants.e2e-spec.ts`
- Modify: `docs/architecture/products-and-categories.md`

- [ ] **Step 1: Write E2E / Integration test suite**

Create `apps/api/src/products/__tests__/merchant-product-variants.e2e-spec.ts` testing:
1. `POST` single variant & default auto-swap.
2. `GET` list variants and single variant.
3. `PATCH` single variant stock/price/default.
4. `DELETE` single variant & default promotion and minimum variant enforcement.

- [ ] **Step 2: Run test suite**

Run: `pnpm test`
Expected: ALL test suites pass.

- [ ] **Step 3: Update Architecture Docs**

Update `docs/architecture/products-and-categories.md` to document the new endpoints under `Merchant admin endpoints`.

- [ ] **Step 4: Commit tests and documentation**

```bash
git add apps/api/src/products/__tests__/merchant-product-variants.e2e-spec.ts docs/architecture/products-and-categories.md
git commit -m "docs & test: add integration tests and update architecture docs for single-variant endpoints"
```
