import { Injectable, Inject } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TenantDbService } from '../../db/tenant-db.service';
import { STORAGE_PORT } from '../../storage/storage.port';
import type { StoragePort } from '../../storage/storage.port';
import { ImageProcessingService } from '../../storage/image-processing.service';
import { Product } from '../../db/entities/products.entity';
import { ProductVariant } from '../../db/entities/product-variants.entity';
import { ProductVariantImage } from '../../db/entities/product-variant-images.entity';
import { Category } from '../../db/entities/categories.entity';
import { ProductCategory } from '../../db/entities/product-categories.entity';
import { CreateProductDto, CreateVariantDto } from '../dto/create-product.dto';
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
import { randomUUID } from 'crypto';
import { TenantSettingsService } from '../../tenant-settings/tenant-settings.service';

export interface PaginatedProducts {
  items: Product[];
  total: number;
  page: number;
  limit: number;
}

export interface ProductStats {
  totalProducts: number;
  activeListings: number;
  lowStock: number;
  outOfStock: number;
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly cls: ClsService,
    @Inject(STORAGE_PORT) private readonly storagePort: StoragePort,
    private readonly imageProcessingService: ImageProcessingService,
    private readonly tenantSettingsService: TenantSettingsService,
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

  private attachClientKeys(
    product: Product,
    clientKeyByVariantId: Map<string, string>,
  ): Product {
    for (const variant of product.variants ?? []) {
      const clientKey = clientKeyByVariantId.get(variant.id);
      if (clientKey !== undefined) {
        (variant as ProductVariant & { clientKey?: string }).clientKey =
          clientKey;
      }
    }
    return product;
  }

  private async createVariantsForProduct(
    em: EntityManager,
    tenantId: string,
    productId: string,
    variants?: CreateVariantDto[],
  ): Promise<ProductVariant[]> {
    if (variants && variants.length > 0) {
      const skus = variants.map((v) => v.sku);
      if (new Set(skus).size !== skus.length) {
        throw new CodedBadRequestException(
          ErrorCode.VALIDATION_FAILED,
          'Duplicate SKU detected in request variants',
        );
      }
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
      const variantsToSave = variants.map((v) => {
        let isDefault = v.isDefault ?? false;
        if (isDefault) {
          if (defaultSet) isDefault = false;
          else defaultSet = true;
        }
        return em.create(ProductVariant, {
          tenantId,
          productId,
          name: v.name ?? null,
          sku: v.sku,
          priceCents: v.priceCents,
          stock: v.stock,
          isDefault,
        });
      });
      if (!defaultSet && variantsToSave.length > 0)
        variantsToSave[0].isDefault = true;
      const saved = await this.saveWithUniqueCheck(() =>
        em.save(ProductVariant, variantsToSave),
      );
      return saved;
    } else {
      const defaultVariant = em.create(ProductVariant, {
        tenantId,
        productId,
        sku: `SKU-${productId}`,
        priceCents: 0,
        stock: 0,
        isDefault: true,
      });
      const saved = await this.saveWithUniqueCheck(() =>
        em.save(ProductVariant, defaultVariant),
      );
      return [saved];
    }
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
      const savedVariants = await this.createVariantsForProduct(
        em,
        tenantId,
        savedProduct.id,
        dto.variants,
      );
      const clientKeyByVariantId = new Map<string, string>();
      (dto.variants ?? []).forEach((v, i) => {
        if (v.clientKey && savedVariants[i]) {
          clientKeyByVariantId.set(savedVariants[i].id, v.clientKey);
        }
      });

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

      return this.attachClientKeys(
        await this.findProductById(em, savedProduct.id),
        clientKeyByVariantId,
      );
    });
  }

  async createWithImages(
    dto: CreateProductDto,
    variantImageFiles: Map<number, Express.Multer.File[]>,
  ): Promise<Product> {
    // Process images outside the transaction to avoid holding the DB connection during I/O
    const processedImages = new Map<
      number,
      Array<{ imageId: string; buffer: Buffer; contentType: string }>
    >();

    for (const [variantIndex, files] of variantImageFiles) {
      const processed: Array<{
        imageId: string;
        buffer: Buffer;
        contentType: string;
      }> = [];
      for (const file of files) {
        const imageId = randomUUID();
        const result = await this.imageProcessingService.processVariantImage(
          file.buffer,
        );
        processed.push({
          imageId,
          buffer: result.buffer,
          contentType: result.contentType,
        });
      }
      processedImages.set(variantIndex, processed);
    }

    return this.tenantDb.run(async (em) => {
      const tenantId = this.cls.get<string>('tenantId');

      // Validate categories
      if (dto.categoryIds && dto.categoryIds.length > 0) {
        const found = await em.find(Category, {
          where: { id: In(dto.categoryIds) },
        });
        if (found.length !== dto.categoryIds.length) {
          throw new CodedBadRequestException(
            ErrorCode.VALIDATION_FAILED,
            'One or more provided category IDs do not exist',
          );
        }
      }

      // Create product
      const product = em.create(Product, {
        tenantId,
        title: dto.title,
        description: dto.description ?? null,
        status: dto.status,
      });
      const savedProduct = await this.saveWithUniqueCheck(() =>
        em.save(Product, product),
      );

      // Create variants
      const savedVariants = await this.createVariantsForProduct(
        em,
        tenantId,
        savedProduct.id,
        dto.variants,
      );
      const clientKeyByVariantId = new Map<string, string>();
      (dto.variants ?? []).forEach((v, i) => {
        if (v.clientKey && savedVariants[i]) {
          clientKeyByVariantId.set(savedVariants[i].id, v.clientKey);
        }
      });

      // Create category associations
      if (dto.categoryIds && dto.categoryIds.length > 0) {
        const pcs = dto.categoryIds.map((catId) =>
          em.create(ProductCategory, {
            tenantId,
            productId: savedProduct.id,
            categoryId: catId,
          }),
        );
        await em.save(ProductCategory, pcs);
      }

      // Upload images and create records
      for (const [variantIndex, images] of processedImages) {
        if (variantIndex >= savedVariants.length) continue;
        const variant = savedVariants[variantIndex];
        for (let i = 0; i < images.length; i++) {
          const { imageId, buffer, contentType } = images[i];
          const storageKey = `tenants/${tenantId}/products/${variant.id}/${imageId}.webp`;
          const { url } = await this.storagePort.upload({
            key: storageKey,
            buffer,
            contentType,
            tenantId,
          });
          const image = em.create(ProductVariantImage, {
            id: imageId,
            tenantId,
            variantId: variant.id,
            storageKey,
            url,
            altText: null,
            sortOrder: i,
            isPrimary: i === 0,
          });
          await em.save(ProductVariantImage, image);
        }
      }

      return this.attachClientKeys(
        await this.findProductById(em, savedProduct.id),
        clientKeyByVariantId,
      );
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

  async getStats(): Promise<ProductStats> {
    return this.tenantDb.run(async (em) => {
      const settings = await this.tenantSettingsService.getSettings(em);

      const rows = await em
        .createQueryBuilder(Product, 'product')
        .leftJoin('product.variants', 'variant')
        .select('product.id', 'id')
        .addSelect('product.status', 'status')
        .addSelect('COALESCE(SUM(variant.stock), 0)', 'totalStock')
        .groupBy('product.id')
        .addGroupBy('product.tenantId')
        .getRawMany<{ id: string; status: string; totalStock: string }>();

      let activeListings = 0;
      let lowStock = 0;
      let outOfStock = 0;

      for (const row of rows) {
        if (row.status !== 'active') continue;
        activeListings++;
        const stock = Number(row.totalStock);
        if (stock === 0) outOfStock++;
        else if (stock <= settings.lowStockThreshold) lowStock++;
      }

      return {
        totalProducts: rows.length,
        activeListings,
        lowStock,
        outOfStock,
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
      const clientKeyByVariantId = new Map<string, string>();
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

          const savedVariants = await this.saveWithUniqueCheck(() =>
            em.save(ProductVariant, variantsToSave),
          );
          dto.variants.forEach((vDto, i) => {
            if (vDto.clientKey && savedVariants[i]) {
              clientKeyByVariantId.set(savedVariants[i].id, vDto.clientKey);
            }
          });
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

      return this.attachClientKeys(
        await this.findProductById(em, id),
        clientKeyByVariantId,
      );
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
