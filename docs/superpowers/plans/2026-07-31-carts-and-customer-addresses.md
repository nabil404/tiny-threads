# Carts & Customer Address Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement server-side persistent multi-tenant carts (supporting guest session IDs and customer accounts with login cart merging) and customer address CRUD with default shipping/billing transaction logic in `apps/api`.

**Architecture:** Add `carts` and `customer-addresses` NestJS modules inside `apps/api/src/`. Update `Cart` and `CustomerAddress` entities with PostgreSQL RLS support via `TenantDbService.run(...)`. Add error codes to `@tiny-threads/shared`.

**Tech Stack:** NestJS 11, TypeORM, PostgreSQL 16 (RLS), TypeScript, Jest, Supertest.

## Global Constraints

- Tenancy Isolation: All database queries MUST run inside `TenantDbService.run(...)`.
- Error Handling: Throw NestJS `Coded*Exception` instances using `ErrorCode` enum values from `@tiny-threads/shared`.
- API Conventions: Global prefix `/api/v1/` is applied in `bootstrap.ts`; routes match standard NestJS REST structure.
- Testing: Follow TDD — write failing unit/E2E test steps before implementation steps.

---

### Task 1: Error Codes & Database Entity Migration

**Files:**
- Modify: `packages/shared/src/errors/error-codes.ts:38-44`
- Modify: `apps/api/src/db/entities/carts.entity.ts:18-35`
- Modify: `apps/api/src/db/entities/customer-addresses.entity.ts:8-30`
- Create: `apps/api/src/db/migrations/1780000000000-AddCartsAndCustomerAddressesFields.ts`

**Interfaces:**
- Consumes: TypeORM `@Entity`, `@Column`, `@Index`, `TenantEntityBase`.
- Produces: Updated `Cart` & `CustomerAddress` entities, `ErrorCode.CART_NOT_FOUND`, `ErrorCode.CART_ITEM_NOT_FOUND`, `ErrorCode.INVALID_CART_QUANTITY`, `ErrorCode.PRODUCT_VARIANT_NOT_FOUND`, `ErrorCode.ADDRESS_NOT_FOUND`, `ErrorCode.INVALID_COUNTRY_CODE`.

- [ ] **Step 1: Write error codes to `@tiny-threads/shared`**

Add the new error codes to `packages/shared/src/errors/error-codes.ts`:
```typescript
  // carts & addresses
  CART_NOT_FOUND = 'CART_NOT_FOUND',
  CART_ITEM_NOT_FOUND = 'CART_ITEM_NOT_FOUND',
  INVALID_CART_QUANTITY = 'INVALID_CART_QUANTITY',
  PRODUCT_VARIANT_NOT_FOUND = 'PRODUCT_VARIANT_NOT_FOUND',
  ADDRESS_NOT_FOUND = 'ADDRESS_NOT_FOUND',
  INVALID_COUNTRY_CODE = 'INVALID_COUNTRY_CODE',
```

- [ ] **Step 2: Update `Cart` Entity (`apps/api/src/db/entities/carts.entity.ts`)**

```typescript
import {
  Entity,
  Column,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { TenantEntityBase } from './base';
import { Customer } from './customers.entity';
import { CartItem } from './cart-items.entity';

export type CartStatus = 'active' | 'abandoned' | 'converted';

@Entity({ name: 'carts' })
@Index('carts_tenant_customer_idx', ['tenantId', 'customerId'])
@Index('carts_tenant_session_idx', ['tenantId', 'sessionId'])
@Index('carts_tenant_status_idx', ['tenantId', 'status'])
export class Cart extends TenantEntityBase {
  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId?: string | null;

  @Column({ name: 'session_id', type: 'text', nullable: true })
  sessionId?: string | null;

  @ManyToOne(() => Customer)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'customer_id', referencedColumnName: 'id' },
  ])
  customer?: Customer;

  @Column({ type: 'text' })
  status!: CartStatus;

  @OneToMany(() => CartItem, (item) => item.cart)
  items?: CartItem[];
}
```

- [ ] **Step 3: Update `CustomerAddress` Entity (`apps/api/src/db/entities/customer-addresses.entity.ts`)**

```typescript
import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { TenantEntityBase } from './base';
import { Customer } from './customers.entity';
import { Country } from './countries.entity';

@Entity({ name: 'customer_addresses' })
@Index('customer_addresses_tenant_customer_idx', ['tenantId', 'customerId'])
export class CustomerAddress extends TenantEntityBase {
  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @ManyToOne(() => Customer)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'customer_id', referencedColumnName: 'id' },
  ])
  customer?: Customer;

  @Column({ name: 'first_name', type: 'text' })
  firstName!: string;

  @Column({ name: 'last_name', type: 'text' })
  lastName!: string;

  @Column({ type: 'text', nullable: true })
  company?: string | null;

  @Column({ type: 'text' })
  line1!: string;

  @Column({ type: 'text', nullable: true })
  line2?: string | null;

  @Column({ type: 'text' })
  city!: string;

  @Column({ name: 'state_province', type: 'text', nullable: true })
  stateProvince?: string | null;

  @Column({ name: 'postal_code', type: 'text' })
  postalCode!: string;

  @Column({ name: 'country_code', type: 'text' })
  countryCode!: string;

  @ManyToOne(() => Country)
  @JoinColumn({ name: 'country_code', referencedColumnName: 'code' })
  country?: Country;

  @Column({ type: 'text', nullable: true })
  phone?: string | null;

  @Column({ name: 'is_default_shipping', type: 'boolean', default: false })
  isDefaultShipping!: boolean;

  @Column({ name: 'is_default_billing', type: 'boolean', default: false })
  isDefaultBilling!: boolean;
}
```

- [ ] **Step 4: Create DB Migration (`apps/api/src/db/migrations/1780000000000-AddCartsAndCustomerAddressesFields.ts`)**

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCartsAndCustomerAddressesFields1780000000000 implements MigrationInterface {
  name = 'AddCartsAndCustomerAddressesFields1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "carts" ALTER COLUMN "customer_id" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "session_id" text`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "carts_tenant_session_idx" ON "carts" ("tenant_id", "session_id")`);

    await queryRunner.query(`ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "first_name" text NOT NULL DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "last_name" text NOT NULL DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "company" text`);
    await queryRunner.query(`ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "line2" text`);
    await queryRunner.query(`ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "city" text NOT NULL DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "state_province" text`);
    await queryRunner.query(`ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "postal_code" text NOT NULL DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "phone" text`);
    await queryRunner.query(`ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "is_default_shipping" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "is_default_billing" boolean NOT NULL DEFAULT false`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "carts_tenant_session_idx"`);
    await queryRunner.query(`ALTER TABLE "carts" DROP COLUMN "session_id"`);
    await queryRunner.query(`ALTER TABLE "carts" ALTER COLUMN "customer_id" SET NOT NULL`);

    await queryRunner.query(`ALTER TABLE "customer_addresses" DROP COLUMN "is_default_billing"`);
    await queryRunner.query(`ALTER TABLE "customer_addresses" DROP COLUMN "is_default_shipping"`);
    await queryRunner.query(`ALTER TABLE "customer_addresses" DROP COLUMN "phone"`);
    await queryRunner.query(`ALTER TABLE "customer_addresses" DROP COLUMN "postal_code"`);
    await queryRunner.query(`ALTER TABLE "customer_addresses" DROP COLUMN "state_province"`);
    await queryRunner.query(`ALTER TABLE "customer_addresses" DROP COLUMN "city"`);
    await queryRunner.query(`ALTER TABLE "customer_addresses" DROP COLUMN "line2"`);
    await queryRunner.query(`ALTER TABLE "customer_addresses" DROP COLUMN "company"`);
    await queryRunner.query(`ALTER TABLE "customer_addresses" DROP COLUMN "last_name"`);
    await queryRunner.query(`ALTER TABLE "customer_addresses" DROP COLUMN "first_name"`);
  }
}
```

- [ ] **Step 5: Verify build & shared package**

Run: `pnpm build`
Expected: PASS clean compilation across `@tiny-threads/shared` and `@tiny-threads/api`.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/errors/error-codes.ts apps/api/src/db/entities/ apps/api/src/db/migrations/
git commit -m "feat(db): update carts and customer_addresses entities and add migration"
```

---

### Task 2: Carts DTOs & Service

**Files:**
- Create: `apps/api/src/carts/dto/add-cart-item.dto.ts`
- Create: `apps/api/src/carts/dto/update-cart-item.dto.ts`
- Create: `apps/api/src/carts/dto/merge-cart.dto.ts`
- Create: `apps/api/src/carts/carts.service.ts`
- Create: `apps/api/src/carts/carts.service.spec.ts`

**Interfaces:**
- Consumes: `TenantDbService`, `Cart`, `CartItem`, `ProductVariant`, `ErrorCode`.
- Produces: `CartsService.getOrCreateCart(customerId?, sessionId?)`, `addItem(cart, variantId, qty)`, `updateItemQty(cart, itemId, qty)`, `removeItem(cart, itemId)`, `mergeCart(customerId, guestSessionId)`.

- [ ] **Step 1: Write DTO classes**

`apps/api/src/carts/dto/add-cart-item.dto.ts`:
```typescript
import { IsUUID, IsInt, Min } from 'class-validator';

export class AddCartItemDto {
  @IsUUID()
  variantId!: string;

  @IsInt()
  @Min(1)
  qty!: number;
}
```

`apps/api/src/carts/dto/update-cart-item.dto.ts`:
```typescript
import { IsInt, Min } from 'class-validator';

export class UpdateCartItemDto {
  @IsInt()
  @Min(0)
  qty!: number;
}
```

`apps/api/src/carts/dto/merge-cart.dto.ts`:
```typescript
import { IsUUID } from 'class-validator';

export class MergeCartDto {
  @IsUUID()
  guestSessionId!: string;
}
```

- [ ] **Step 2: Write unit test suite (`apps/api/src/carts/carts.service.spec.ts`)**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { CartsService } from './carts.service';
import { TenantDbService } from '../db/tenant-db.service';
import { Cart } from '../db/entities/carts.entity';
import { CartItem } from '../db/entities/cart-items.entity';
import { ProductVariant } from '../db/entities/product-variants.entity';
import { CodedNotFoundException, CodedBadRequestException } from '../common/errors';
import { ErrorCode } from '@tiny-threads/shared';

describe('CartsService', () => {
  let service: CartsService;
  let tenantDbService: jest.Mocked<TenantDbService>;

  const mockEntityManager = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    tenantDbService = {
      run: jest.fn().mockImplementation((cb) => cb(mockEntityManager)),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartsService,
        { provide: TenantDbService, useValue: tenantDbService },
      ],
    }).compile();

    service = module.get<CartsService>(CartsService);
    jest.clearAllMocks();
  });

  describe('getOrCreateCart', () => {
    it('should return existing active cart for customer', async () => {
      const existingCart = { id: 'cart-1', customerId: 'cust-1', status: 'active', items: [] };
      mockEntityManager.findOne.mockResolvedValue(existingCart);

      const cart = await service.getOrCreateCart('cust-1', undefined);
      expect(cart).toEqual(existingCart);
    });

    it('should create new active cart if none exists', async () => {
      mockEntityManager.findOne.mockResolvedValue(null);
      const newCart = { id: 'cart-2', customerId: 'cust-1', status: 'active', items: [] };
      mockEntityManager.create.mockReturnValue(newCart);
      mockEntityManager.save.mockResolvedValue(newCart);

      const cart = await service.getOrCreateCart('cust-1', undefined);
      expect(cart).toEqual(newCart);
      expect(mockEntityManager.create).toHaveBeenCalledWith(Cart, expect.objectContaining({
        customerId: 'cust-1',
        status: 'active',
      }));
    });
  });

  describe('addItem', () => {
    it('should throw CodedNotFoundException if product variant does not exist', async () => {
      const cart = { id: 'cart-1', items: [] } as any;
      mockEntityManager.findOne.mockResolvedValue(null);

      await expect(service.addItem(cart.id, 'invalid-variant', 1)).rejects.toThrow(
        CodedNotFoundException,
      );
    });
  });
});
```

- [ ] **Step 3: Run unit test to verify failure**

Run: `pnpm test -- carts.service.spec.ts`
Expected: FAIL with "Cannot find module ./carts.service".

- [ ] **Step 4: Implement `CartsService` (`apps/api/src/carts/carts.service.ts`)**

```typescript
import { Injectable } from '@nestjs/common';
import { TenantDbService } from '../db/tenant-db.service';
import { Cart } from '../db/entities/carts.entity';
import { CartItem } from '../db/entities/cart-items.entity';
import { ProductVariant } from '../db/entities/product-variants.entity';
import { CodedNotFoundException, CodedBadRequestException } from '../common/errors';
import { ErrorCode } from '@tiny-threads/shared';

@Injectable()
export class CartsService {
  constructor(private readonly tenantDb: TenantDbService) {}

  async getOrCreateCart(customerId?: string, sessionId?: string): Promise<Cart> {
    if (!customerId && !sessionId) {
      throw new CodedBadRequestException(
        ErrorCode.VALIDATION_FAILED,
        'Either customerId or sessionId must be provided',
      );
    }

    return this.tenantDb.run(async (em) => {
      const whereCondition = customerId
        ? { customerId, status: 'active' as const }
        : { sessionId, status: 'active' as const };

      let cart = await em.findOne(Cart, {
        where: whereCondition,
        relations: ['items', 'items.variant', 'items.variant.product'],
      });

      if (!cart) {
        const newCart = em.create(Cart, {
          customerId: customerId ?? null,
          sessionId: sessionId ?? null,
          status: 'active',
        });
        cart = await em.save(Cart, newCart);
        cart.items = [];
      }

      return cart;
    });
  }

  async addItem(cartId: string, variantId: string, qty: number): Promise<Cart> {
    return this.tenantDb.run(async (em) => {
      const cart = await em.findOne(Cart, {
        where: { id: cartId, status: 'active' },
        relations: ['items'],
      });
      if (!cart) {
        throw new CodedNotFoundException(ErrorCode.CART_NOT_FOUND, 'Cart not found');
      }

      const variant = await em.findOne(ProductVariant, { where: { id: variantId } });
      if (!variant) {
        throw new CodedNotFoundException(
          ErrorCode.PRODUCT_VARIANT_NOT_FOUND,
          'Product variant not found',
        );
      }

      let existingItem = cart.items?.find((item) => item.variantId === variantId);
      if (existingItem) {
        existingItem.qty += qty;
        await em.save(CartItem, existingItem);
      } else {
        const newItem = em.create(CartItem, {
          cartId: cart.id,
          variantId,
          qty,
        });
        await em.save(CartItem, newItem);
      }

      return this.getCartById(cart.id);
    });
  }

  async updateItemQty(cartId: string, itemId: string, qty: number): Promise<Cart> {
    return this.tenantDb.run(async (em) => {
      const item = await em.findOne(CartItem, { where: { id: itemId, cartId } });
      if (!item) {
        throw new CodedNotFoundException(ErrorCode.CART_ITEM_NOT_FOUND, 'Cart item not found');
      }

      if (qty <= 0) {
        await em.remove(CartItem, item);
      } else {
        item.qty = qty;
        await em.save(CartItem, item);
      }

      return this.getCartById(cartId);
    });
  }

  async removeItem(cartId: string, itemId: string): Promise<Cart> {
    return this.updateItemQty(cartId, itemId, 0);
  }

  async mergeCart(customerId: string, guestSessionId: string): Promise<Cart> {
    return this.tenantDb.run(async (em) => {
      const customerCart = await this.getOrCreateCart(customerId, undefined);
      const guestCart = await em.findOne(Cart, {
        where: { sessionId: guestSessionId, status: 'active' },
        relations: ['items'],
      });

      if (!guestCart || !guestCart.items || guestCart.items.length === 0) {
        return customerCart;
      }

      for (const guestItem of guestCart.items) {
        const existingItem = customerCart.items?.find(
          (item) => item.variantId === guestItem.variantId,
        );
        if (existingItem) {
          existingItem.qty += guestItem.qty;
          await em.save(CartItem, existingItem);
        } else {
          const newItem = em.create(CartItem, {
            cartId: customerCart.id,
            variantId: guestItem.variantId,
            qty: guestItem.qty,
          });
          await em.save(CartItem, newItem);
        }
      }

      guestCart.status = 'abandoned';
      await em.save(Cart, guestCart);

      return this.getCartById(customerCart.id);
    });
  }

  private async getCartById(cartId: string): Promise<Cart> {
    return this.tenantDb.run(async (em) => {
      const cart = await em.findOne(Cart, {
        where: { id: cartId },
        relations: ['items', 'items.variant', 'items.variant.product'],
      });
      if (!cart) {
        throw new CodedNotFoundException(ErrorCode.CART_NOT_FOUND, 'Cart not found');
      }
      return cart;
    });
  }
}
```

- [ ] **Step 5: Run unit tests to verify pass**

Run: `pnpm test -- carts.service.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/carts/
git commit -m "feat(carts): implement CartsService and DTOs"
```

---

### Task 3: Carts Controller & Module Wiring

**Files:**
- Create: `apps/api/src/carts/carts.controller.ts`
- Create: `apps/api/src/carts/carts.module.ts`
- Modify: `apps/api/src/app/app.module.ts:15-30`

**Interfaces:**
- Consumes: `CartsService`, `CustomerJwtAuthGuard`, `AddCartItemDto`, `UpdateCartItemDto`, `MergeCartDto`.
- Produces: `CartsModule`, REST endpoints `GET /api/v1/cart`, `POST /api/v1/cart/items`, `PATCH /api/v1/cart/items/:id`, `DELETE /api/v1/cart/items/:id`, `POST /api/v1/cart/merge`.

- [ ] **Step 1: Create `CartsController` (`apps/api/src/carts/carts.controller.ts`)**

```typescript
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Headers,
  Res,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Response } from 'express';
import { CartsService } from './carts.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { MergeCartDto } from './dto/merge-cart.dto';
import { CustomerJwtAuthGuard } from '../customers/guards/customer-jwt-auth.guard';
import { randomUUID } from 'crypto';

@Controller('cart')
export class CartsController {
  constructor(private readonly cartsService: CartsService) {}

  @Get()
  async getCart(
    @Req() req: any,
    @Headers('x-guest-session-id') guestSessionId: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const customerId = req.user?.id;
    let sessionId = guestSessionId;

    if (!customerId && !sessionId) {
      sessionId = randomUUID();
      res.setHeader('X-Guest-Session-ID', sessionId);
    }

    const cart = await this.cartsService.getOrCreateCart(customerId, sessionId);
    return this.formatCartResponse(cart);
  }

  @Post('items')
  async addItem(
    @Req() req: any,
    @Headers('x-guest-session-id') guestSessionId: string | undefined,
    @Body() dto: AddCartItemDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const customerId = req.user?.id;
    let sessionId = guestSessionId;

    if (!customerId && !sessionId) {
      sessionId = randomUUID();
      res.setHeader('X-Guest-Session-ID', sessionId);
    }

    const cart = await this.cartsService.getOrCreateCart(customerId, sessionId);
    const updatedCart = await this.cartsService.addItem(cart.id, dto.variantId, dto.qty);
    return this.formatCartResponse(updatedCart);
  }

  @Patch('items/:id')
  async updateItemQty(
    @Req() req: any,
    @Headers('x-guest-session-id') guestSessionId: string | undefined,
    @Param('id') itemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    const customerId = req.user?.id;
    const cart = await this.cartsService.getOrCreateCart(customerId, guestSessionId);
    const updatedCart = await this.cartsService.updateItemQty(cart.id, itemId, dto.qty);
    return this.formatCartResponse(updatedCart);
  }

  @Delete('items/:id')
  async removeItem(
    @Req() req: any,
    @Headers('x-guest-session-id') guestSessionId: string | undefined,
    @Param('id') itemId: string,
  ) {
    const customerId = req.user?.id;
    const cart = await this.cartsService.getOrCreateCart(customerId, guestSessionId);
    const updatedCart = await this.cartsService.removeItem(cart.id, itemId);
    return this.formatCartResponse(updatedCart);
  }

  @Post('merge')
  @UseGuards(CustomerJwtAuthGuard)
  async mergeCart(@Req() req: any, @Body() dto: MergeCartDto) {
    const customerId = req.user.id;
    const cart = await this.cartsService.mergeCart(customerId, dto.guestSessionId);
    return this.formatCartResponse(cart);
  }

  private formatCartResponse(cart: any) {
    const items = (cart.items || []).map((item: any) => {
      const priceCents = item.variant?.priceCents || 0;
      return {
        id: item.id,
        variantId: item.variantId,
        productName: item.variant?.product?.name || '',
        variantName: item.variant?.name || '',
        priceCents,
        qty: item.qty,
        lineTotalCents: priceCents * item.qty,
      };
    });

    const itemCount = items.reduce((acc: number, item: any) => acc + item.qty, 0);
    const subtotalCents = items.reduce((acc: number, item: any) => acc + item.lineTotalCents, 0);

    return {
      id: cart.id,
      status: cart.status,
      itemCount,
      subtotalCents,
      items,
    };
  }
}
```

- [ ] **Step 2: Create `CartsModule` (`apps/api/src/carts/carts.module.ts`)**

```typescript
import { Module } from '@nestjs/common';
import { CartsController } from './carts.controller';
import { CartsService } from './carts.service';
import { DatabaseModule } from '../db/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [CartsController],
  providers: [CartsService],
  exports: [CartsService],
})
export class CartsModule {}
```

- [ ] **Step 3: Register `CartsModule` in `AppModule` (`apps/api/src/app/app.module.ts`)**

```typescript
import { CartsModule } from '../carts/carts.module';

@Module({
  imports: [
    // ...
    ProductsModule,
    CartsModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 4: Verify build**

Run: `pnpm build`
Expected: PASS clean compilation.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/carts/ apps/api/src/app/app.module.ts
git commit -m "feat(carts): create CartsModule and register in AppModule"
```

---

### Task 4: Customer Addresses DTOs & Service

**Files:**
- Create: `apps/api/src/customer-addresses/dto/create-address.dto.ts`
- Create: `apps/api/src/customer-addresses/dto/update-address.dto.ts`
- Create: `apps/api/src/customer-addresses/dto/set-default-address.dto.ts`
- Create: `apps/api/src/customer-addresses/customer-addresses.service.ts`
- Create: `apps/api/src/customer-addresses/customer-addresses.service.spec.ts`

**Interfaces:**
- Consumes: `TenantDbService`, `CustomerAddress`, `Country`, `ErrorCode`.
- Produces: `CustomerAddressesService.getAddresses(customerId)`, `getAddressById(customerId, addressId)`, `createAddress(customerId, dto)`, `updateAddress(customerId, addressId, dto)`, `deleteAddress(customerId, addressId)`, `setDefaultFlags(customerId, addressId, flags)`.

- [ ] **Step 1: Write DTO classes**

`apps/api/src/customer-addresses/dto/create-address.dto.ts`:
```typescript
import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class CreateAddressDto {
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @IsString()
  @IsOptional()
  company?: string;

  @IsString()
  @IsNotEmpty()
  line1!: string;

  @IsString()
  @IsOptional()
  line2?: string;

  @IsString()
  @IsNotEmpty()
  city!: string;

  @IsString()
  @IsOptional()
  stateProvince?: string;

  @IsString()
  @IsNotEmpty()
  postalCode!: string;

  @IsString()
  @IsNotEmpty()
  countryCode!: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsBoolean()
  @IsOptional()
  isDefaultShipping?: boolean;

  @IsBoolean()
  @IsOptional()
  isDefaultBilling?: boolean;
}
```

`apps/api/src/customer-addresses/dto/update-address.dto.ts`:
```typescript
import { PartialType } from '@nestjs/mapped-types';
import { CreateAddressDto } from './create-address.dto';

export class UpdateAddressDto extends PartialType(CreateAddressDto) {}
```

`apps/api/src/customer-addresses/dto/set-default-address.dto.ts`:
```typescript
import { IsBoolean, IsOptional } from 'class-validator';

export class SetDefaultAddressDto {
  @IsBoolean()
  @IsOptional()
  defaultShipping?: boolean;

  @IsBoolean()
  @IsOptional()
  defaultBilling?: boolean;
}
```

- [ ] **Step 2: Write unit tests (`apps/api/src/customer-addresses/customer-addresses.service.spec.ts`)**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { CustomerAddressesService } from './customer-addresses.service';
import { TenantDbService } from '../db/tenant-db.service';
import { Country } from '../db/entities/countries.entity';
import { CustomerAddress } from '../db/entities/customer-addresses.entity';
import { CodedNotFoundException } from '../common/errors';

describe('CustomerAddressesService', () => {
  let service: CustomerAddressesService;
  let tenantDbService: jest.Mocked<TenantDbService>;

  const mockEntityManager = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    tenantDbService = {
      run: jest.fn().mockImplementation((cb) => cb(mockEntityManager)),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerAddressesService,
        { provide: TenantDbService, useValue: tenantDbService },
      ],
    }).compile();

    service = module.get<CustomerAddressesService>(CustomerAddressesService);
    jest.clearAllMocks();
  });

  describe('createAddress', () => {
    it('should throw CodedNotFoundException if countryCode does not exist', async () => {
      mockEntityManager.findOne.mockResolvedValue(null);

      await expect(
        service.createAddress('cust-1', {
          firstName: 'John',
          lastName: 'Doe',
          line1: '123 Main St',
          city: 'City',
          postalCode: '12345',
          countryCode: 'XX',
        }),
      ).rejects.toThrow(CodedNotFoundException);
    });
  });
});
```

- [ ] **Step 3: Run unit tests to verify failure**

Run: `pnpm test -- customer-addresses.service.spec.ts`
Expected: FAIL with "Cannot find module ./customer-addresses.service".

- [ ] **Step 4: Implement `CustomerAddressesService` (`apps/api/src/customer-addresses/customer-addresses.service.ts`)**

```typescript
import { Injectable } from '@nestjs/common';
import { TenantDbService } from '../db/tenant-db.service';
import { CustomerAddress } from '../db/entities/customer-addresses.entity';
import { Country } from '../db/entities/countries.entity';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { CodedNotFoundException } from '../common/errors';
import { ErrorCode } from '@tiny-threads/shared';

@Injectable()
export class CustomerAddressesService {
  constructor(private readonly tenantDb: TenantDbService) {}

  async getAddresses(customerId: string): Promise<CustomerAddress[]> {
    return this.tenantDb.run(async (em) => {
      return em.find(CustomerAddress, {
        where: { customerId },
        order: { createdAt: 'DESC' },
      });
    });
  }

  async getAddressById(customerId: string, addressId: string): Promise<CustomerAddress> {
    return this.tenantDb.run(async (em) => {
      const address = await em.findOne(CustomerAddress, {
        where: { id: addressId, customerId },
      });
      if (!address) {
        throw new CodedNotFoundException(ErrorCode.ADDRESS_NOT_FOUND, 'Address not found');
      }
      return address;
    });
  }

  async createAddress(customerId: string, dto: CreateAddressDto): Promise<CustomerAddress> {
    return this.tenantDb.run(async (em) => {
      const country = await em.findOne(Country, { where: { code: dto.countryCode } });
      if (!country) {
        throw new CodedNotFoundException(ErrorCode.INVALID_COUNTRY_CODE, 'Invalid country code');
      }

      if (dto.isDefaultShipping) {
        await em.update(CustomerAddress, { customerId }, { isDefaultShipping: false });
      }
      if (dto.isDefaultBilling) {
        await em.update(CustomerAddress, { customerId }, { isDefaultBilling: false });
      }

      const address = em.create(CustomerAddress, {
        customerId,
        ...dto,
      });

      return em.save(CustomerAddress, address);
    });
  }

  async updateAddress(
    customerId: string,
    addressId: string,
    dto: UpdateAddressDto,
  ): Promise<CustomerAddress> {
    return this.tenantDb.run(async (em) => {
      const address = await this.getAddressById(customerId, addressId);

      if (dto.countryCode) {
        const country = await em.findOne(Country, { where: { code: dto.countryCode } });
        if (!country) {
          throw new CodedNotFoundException(ErrorCode.INVALID_COUNTRY_CODE, 'Invalid country code');
        }
      }

      if (dto.isDefaultShipping) {
        await em.update(CustomerAddress, { customerId }, { isDefaultShipping: false });
      }
      if (dto.isDefaultBilling) {
        await em.update(CustomerAddress, { customerId }, { isDefaultBilling: false });
      }

      Object.assign(address, dto);
      return em.save(CustomerAddress, address);
    });
  }

  async deleteAddress(customerId: string, addressId: string): Promise<void> {
    return this.tenantDb.run(async (em) => {
      const address = await this.getAddressById(customerId, addressId);
      await em.remove(CustomerAddress, address);
    });
  }

  async setDefaultFlags(
    customerId: string,
    addressId: string,
    flags: { defaultShipping?: boolean; defaultBilling?: boolean },
  ): Promise<CustomerAddress> {
    return this.tenantDb.run(async (em) => {
      const address = await this.getAddressById(customerId, addressId);

      if (flags.defaultShipping) {
        await em.update(CustomerAddress, { customerId }, { isDefaultShipping: false });
        address.isDefaultShipping = true;
      }
      if (flags.defaultBilling) {
        await em.update(CustomerAddress, { customerId }, { isDefaultBilling: false });
        address.isDefaultBilling = true;
      }

      return em.save(CustomerAddress, address);
    });
  }
}
```

- [ ] **Step 5: Run unit tests to verify pass**

Run: `pnpm test -- customer-addresses.service.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/customer-addresses/
git commit -m "feat(addresses): implement CustomerAddressesService and DTOs"
```

---

### Task 5: Customer Addresses Controller & Module Wiring

**Files:**
- Create: `apps/api/src/customer-addresses/customer-addresses.controller.ts`
- Create: `apps/api/src/customer-addresses/customer-addresses.module.ts`
- Modify: `apps/api/src/app/app.module.ts:16-32`

**Interfaces:**
- Consumes: `CustomerAddressesService`, `CustomerJwtAuthGuard`, `CreateAddressDto`, `UpdateAddressDto`, `SetDefaultAddressDto`.
- Produces: `CustomerAddressesModule`, REST endpoints under `/api/v1/customers/me/addresses`.

- [ ] **Step 1: Create `CustomerAddressesController` (`apps/api/src/customer-addresses/customer-addresses.controller.ts`)**

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
  Req,
} from '@nestjs/common';
import { CustomerAddressesService } from './customer-addresses.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { SetDefaultAddressDto } from './dto/set-default-address.dto';
import { CustomerJwtAuthGuard } from '../customers/guards/customer-jwt-auth.guard';

@Controller('customers/me/addresses')
@UseGuards(CustomerJwtAuthGuard)
export class CustomerAddressesController {
  constructor(private readonly addressesService: CustomerAddressesService) {}

  @Get()
  async getAddresses(@Req() req: any) {
    return this.addressesService.getAddresses(req.user.id);
  }

  @Get(':id')
  async getAddressById(@Req() req: any, @Param('id') addressId: string) {
    return this.addressesService.getAddressById(req.user.id, addressId);
  }

  @Post()
  async createAddress(@Req() req: any, @Body() dto: CreateAddressDto) {
    return this.addressesService.createAddress(req.user.id, dto);
  }

  @Patch(':id')
  async updateAddress(
    @Req() req: any,
    @Param('id') addressId: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addressesService.updateAddress(req.user.id, addressId, dto);
  }

  @Delete(':id')
  async deleteAddress(@Req() req: any, @Param('id') addressId: string) {
    await this.addressesService.deleteAddress(req.user.id, addressId);
    return { success: true };
  }

  @Post(':id/default')
  async setDefault(
    @Req() req: any,
    @Param('id') addressId: string,
    @Body() dto: SetDefaultAddressDto,
  ) {
    return this.addressesService.setDefaultFlags(req.user.id, addressId, {
      defaultShipping: dto.defaultShipping,
      defaultBilling: dto.defaultBilling,
    });
  }
}
```

- [ ] **Step 2: Create `CustomerAddressesModule` (`apps/api/src/customer-addresses/customer-addresses.module.ts`)**

```typescript
import { Module } from '@nestjs/common';
import { CustomerAddressesController } from './customer-addresses.controller';
import { CustomerAddressesService } from './customer-addresses.service';
import { DatabaseModule } from '../db/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [CustomerAddressesController],
  providers: [CustomerAddressesService],
  exports: [CustomerAddressesService],
})
export class CustomerAddressesModule {}
```

- [ ] **Step 3: Register `CustomerAddressesModule` in `AppModule` (`apps/api/src/app/app.module.ts`)**

```typescript
import { CustomerAddressesModule } from '../customer-addresses/customer-addresses.module';

@Module({
  imports: [
    // ...
    CartsModule,
    CustomerAddressesModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 4: Verify build**

Run: `pnpm build`
Expected: PASS clean compilation across workspace.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/customer-addresses/ apps/api/src/app/app.module.ts
git commit -m "feat(addresses): create CustomerAddressesModule and register in AppModule"
```

---

### Task 6: E2E Tests & RLS Verification

**Files:**
- Create: `apps/api/test/carts.e2e-spec.ts`
- Create: `apps/api/test/customer-addresses.e2e-spec.ts`

**Interfaces:**
- Consumes: Supertest, isolated test PostgreSQL database.
- Produces: Verified E2E test suites for guest cart, customer cart merge, customer addresses, and RLS tenant boundary security checks.

- [ ] **Step 1: Create E2E test suite for Carts (`apps/api/test/carts.e2e-spec.ts`)**

```typescript
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { setupE2eApp } from './utils/e2e-setup';

describe('Carts (E2E)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await setupE2eApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/cart - should generate guest session ID and return empty cart', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Host', 'test-tenant.localhost')
      .expect(200);

    expect(res.headers['x-guest-session-id']).toBeDefined();
    expect(res.body.itemCount).toEqual(0);
    expect(res.body.items).toEqual([]);
  });
});
```

- [ ] **Step 2: Run E2E test suite**

Run: `pnpm --filter @tiny-threads/api test:e2e`
Expected: PASS

- [ ] **Step 3: Run RLS verification script**

Run: `pnpm --filter @tiny-threads/api db:verify-rls`
Expected: PASS (All tenant tables have RLS ENABLE and FORCE).

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/
git commit -m "test(e2e): add e2e test suite for carts and customer addresses"
```
