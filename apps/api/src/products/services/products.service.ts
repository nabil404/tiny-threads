import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TenantDbService } from '../../db/tenant-db.service';
import { Product } from '../../db/entities/products.entity';
import { ProductVariant } from '../../db/entities/product-variants.entity';
import { Category } from '../../db/entities/categories.entity';
import { ProductCategory } from '../../db/entities/product-categories.entity';
import { CreateProductDto } from '../dto/create-product.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { ProductQueryDto } from '../dto/product-query.dto';
import { CreateProductVariantDto } from '../dto/create-product-variant.dto';
import { UpdateProductVariantDto } from '../dto/update-product-variant.dto';
import {
  CodedNotFoundException,
  CodedBadRequestException,
  CodedConflictException,
} from '../../common/errors/coded-exceptions';
import { ErrorCode } from '@tiny-threads/shared';
import { In, Not, EntityManager } from 'typeorm';

export interface PaginatedProducts {
  items: Product[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly cls: ClsService,
  ) {}

  private async saveWithUniqueCheck<T>(saveFn: () => Promise<T>): Promise<T> {
    try {
      return await saveFn();
    } catch (err: unknown) {
      const isObj = typeof err === 'object' && err !== null;
      const code = isObj && 'code' in err ? String(err.code) : undefined;
      const message =
        isObj && 'message' in err && typeof err.message === 'string'
          ? err.message
          : '';

      if (code === '23505' || message.includes('unique constraint')) {
        throw new CodedConflictException(
          ErrorCode.DUPLICATE_RESOURCE,
          'A resource with this unique constraint (e.g. SKU) already exists',
        );
      }
      throw err;
    }
  }

  private async findProductById(
    em: EntityManager,
    id: string,
    isStorefront: boolean = false,
  ): Promise<Product> {
    const product = await em.findOne(Product, {
      where: { id },
      relations: {
        variants: {
          images: true,
        },
        productCategories: { category: true },
      },
      order: {
        variants: {
          images: {
            sortOrder: 'ASC',
          },
        },
      },
    });
    if (!product || (isStorefront && product.status !== 'active')) {
      throw new CodedNotFoundException(
        ErrorCode.RESOURCE_NOT_FOUND,
        `Product with ID ${id} not found`,
      );
    }
    return product;
  }

  async create(dto: CreateProductDto): Promise<Product> {
    return this.tenantDb.run(async (em) => {
      const tenantId = this.cls.get<string>('tenantId');

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
        tenantId,
        title: dto.title,
        description: dto.description ?? null,
        status: dto.status,
      });
      const savedProduct = await this.saveWithUniqueCheck(() =>
        em.save(Product, product),
      );

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

        let defaultSet = false;
        const variantsToSave = dto.variants.map((v) => {
          let isDefault = v.isDefault ?? false;
          if (isDefault) {
            if (defaultSet) {
              isDefault = false;
            } else {
              defaultSet = true;
            }
          }
          return em.create(ProductVariant, {
            tenantId,
            productId: savedProduct.id,
            name: v.name ?? null,
            sku: v.sku,
            priceCents: v.priceCents,
            stock: v.stock,
            isDefault,
          });
        });

        if (!defaultSet && variantsToSave.length > 0) {
          variantsToSave[0].isDefault = true;
        }

        await this.saveWithUniqueCheck(() =>
          em.save(ProductVariant, variantsToSave),
        );
      } else {
        // Auto-create default variant
        const defaultVariant = em.create(ProductVariant, {
          tenantId,
          productId: savedProduct.id,
          sku: `SKU-${savedProduct.id}`,
          priceCents: 0,
          stock: 0,
          isDefault: true,
        });
        await this.saveWithUniqueCheck(() =>
          em.save(ProductVariant, defaultVariant),
        );
      }

      // 4. Create Product-Category Associations
      if (dto.categoryIds && dto.categoryIds.length > 0) {
        const productCategories = dto.categoryIds.map((catId) =>
          em.create(ProductCategory, {
            tenantId,
            productId: savedProduct.id,
            categoryId: catId,
          }),
        );
        await em.save(ProductCategory, productCategories);
      }

      return this.findProductById(em, savedProduct.id);
    });
  }

  async findAll(
    query: ProductQueryDto,
    isStorefront: boolean = false,
  ): Promise<PaginatedProducts> {
    return this.tenantDb.run(async (em) => {
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;

      const qb = em
        .createQueryBuilder(Product, 'product')
        .leftJoinAndSelect('product.variants', 'variant')
        .leftJoinAndSelect('variant.images', 'variantImage')
        .leftJoinAndSelect('product.productCategories', 'productCategory')
        .leftJoinAndSelect('productCategory.category', 'category');

      if (isStorefront) {
        qb.andWhere('product.status = :activeStatus', {
          activeStatus: 'active',
        });
      } else if (query.status) {
        qb.andWhere('product.status = :status', { status: query.status });
      }

      if (query.categoryId) {
        qb.innerJoin(
          'product.productCategories',
          'filterCat',
          'filterCat.categoryId = :categoryId',
          {
            categoryId: query.categoryId,
          },
        );
      }

      if (query.q) {
        qb.andWhere('product.title ILIKE :search', { search: `%${query.q}%` });
      }

      qb.orderBy('product.createdAt', 'DESC');
      qb.addOrderBy('variantImage.sortOrder', 'ASC');
      qb.skip((page - 1) * limit);
      qb.take(limit);

      const [items, total] = await qb.getManyAndCount();

      return {
        items,
        total,
        page,
        limit,
      };
    });
  }

  async findStorefrontProducts(
    query: ProductQueryDto,
  ): Promise<PaginatedProducts> {
    return this.findAll(query, true);
  }

  async findStorefrontProductById(id: string): Promise<Product> {
    return this.findById(id, true);
  }

  async findById(id: string, isStorefront: boolean = false): Promise<Product> {
    return this.tenantDb.run(async (em) => {
      return this.findProductById(em, id, isStorefront);
    });
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    return this.tenantDb.run(async (em) => {
      const tenantId = this.cls.get<string>('tenantId');
      const product = await em.findOne(Product, {
        where: { id },
        relations: { variants: true, productCategories: true },
      });

      if (!product) {
        throw new CodedNotFoundException(
          ErrorCode.RESOURCE_NOT_FOUND,
          `Product with ID ${id} not found`,
        );
      }

      if (dto.title !== undefined) product.title = dto.title;
      if (dto.description !== undefined) product.description = dto.description;
      if (dto.status !== undefined) product.status = dto.status;
      await this.saveWithUniqueCheck(() => em.save(Product, product));

      // Category update sync
      if (dto.categoryIds !== undefined) {
        if (dto.categoryIds.length > 0) {
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

        await em.delete(ProductCategory, { productId: id });
        if (dto.categoryIds.length > 0) {
          const pcs = dto.categoryIds.map((catId) =>
            em.create(ProductCategory, {
              tenantId,
              productId: id,
              categoryId: catId,
            }),
          );
          await em.save(ProductCategory, pcs);
        }
      }

      // Variant update sync with upsert diffing
      if (dto.variants !== undefined) {
        if (dto.variants.length > 0) {
          const skus = dto.variants.map((v) => v.sku);
          if (new Set(skus).size !== skus.length) {
            throw new CodedBadRequestException(
              ErrorCode.VALIDATION_FAILED,
              'Duplicate SKU detected in request variants',
            );
          }
          const existingVariant = await em.findOne(ProductVariant, {
            where: { sku: In(skus), productId: Not(id) },
          });
          if (existingVariant) {
            throw new CodedConflictException(
              ErrorCode.DUPLICATE_RESOURCE,
              `Variant SKU ${existingVariant.sku} already exists`,
            );
          }
        }

        const currentVariants = await em.find(ProductVariant, {
          where: { productId: id },
        });

        if (dto.variants.length > 0) {
          const currentMapById = new Map(currentVariants.map((v) => [v.id, v]));
          const currentMapBySku = new Map(
            currentVariants.map((v) => [v.sku, v]),
          );
          const matchedIds = new Set<string>();

          let defaultSet = false;
          const variantsToSave: ProductVariant[] = [];

          for (const vDto of dto.variants) {
            let isDefault = vDto.isDefault ?? false;
            if (isDefault) {
              if (defaultSet) {
                isDefault = false;
              } else {
                defaultSet = true;
              }
            }

            let existing: ProductVariant | undefined;
            if (vDto.id && currentMapById.has(vDto.id)) {
              existing = currentMapById.get(vDto.id);
            } else if (vDto.sku && currentMapBySku.has(vDto.sku)) {
              existing = currentMapBySku.get(vDto.sku);
            }

            if (existing) {
              matchedIds.add(existing.id);
              if (vDto.name !== undefined) existing.name = vDto.name;
              if (vDto.sku !== undefined) existing.sku = vDto.sku;
              if (vDto.priceCents !== undefined)
                existing.priceCents = vDto.priceCents;
              if (vDto.stock !== undefined) existing.stock = vDto.stock;
              existing.isDefault = isDefault;
              variantsToSave.push(existing);
            } else {
              if (
                vDto.sku === undefined ||
                vDto.priceCents === undefined ||
                vDto.stock === undefined
              ) {
                throw new CodedBadRequestException(
                  ErrorCode.VALIDATION_FAILED,
                  'New variant requires sku, priceCents, and stock',
                );
              }
              const newVar = em.create(ProductVariant, {
                tenantId,
                productId: id,
                name: vDto.name ?? null,
                sku: vDto.sku,
                priceCents: vDto.priceCents,
                stock: vDto.stock,
                isDefault,
              });
              variantsToSave.push(newVar);
            }
          }

          if (!defaultSet && variantsToSave.length > 0) {
            variantsToSave[0].isDefault = true;
          }

          const variantsToRemove = currentVariants.filter(
            (v) => !matchedIds.has(v.id),
          );
          const removeIds = variantsToRemove.map((v) => v.id);
          if (removeIds.length > 0) {
            await em.delete(ProductVariant, { id: In(removeIds) });
          }

          await this.saveWithUniqueCheck(() =>
            em.save(ProductVariant, variantsToSave),
          );
        } else {
          // If all variants removed, delete existing and auto-create default variant
          if (currentVariants.length > 0) {
            await em.delete(ProductVariant, { productId: id });
          }
          const defaultVariant = em.create(ProductVariant, {
            tenantId,
            productId: id,
            sku: `SKU-${id}`,
            priceCents: 0,
            stock: 0,
            isDefault: true,
          });
          await this.saveWithUniqueCheck(() =>
            em.save(ProductVariant, defaultVariant),
          );
        }
      }

      return this.findProductById(em, id);
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
        await em.update(ProductVariant, { productId }, { isDefault: false });
      }

      const variant = em.create(ProductVariant, {
        tenantId,
        productId,
        name: dto.name ?? null,
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

      if (dto.name !== undefined) variant.name = dto.name;
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
        await em.update(ProductVariant, { productId }, { isDefault: false });
        variant.isDefault = true;
      } else if (dto.isDefault === false && variant.isDefault) {
        throw new CodedBadRequestException(
          ErrorCode.VALIDATION_FAILED,
          'Product must have at least one default variant',
        );
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
}
