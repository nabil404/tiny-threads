import { Injectable } from '@nestjs/common';
import { TenantDbService } from '../db/tenant-db.service';
import { Product } from '../db/entities/products.entity';
import { ProductVariant } from '../db/entities/product-variants.entity';
import { Category } from '../db/entities/categories.entity';
import { ProductCategory } from '../db/entities/product-categories.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import {
  CodedNotFoundException,
  CodedBadRequestException,
  CodedConflictException,
} from '../common/errors/coded-exceptions';
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
  constructor(private readonly tenantDb: TenantDbService) {}

  private async findProductById(
    em: EntityManager,
    id: string,
    isStorefront: boolean = false,
  ): Promise<Product> {
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
  }

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
            productId: savedProduct.id,
            sku: v.sku,
            priceCents: v.priceCents,
            stock: v.stock,
            isDefault,
          });
        });

        if (!defaultSet && variantsToSave.length > 0) {
          variantsToSave[0].isDefault = true;
        }

        await em.save(ProductVariant, variantsToSave);
      } else {
        // Auto-create default variant
        const defaultVariant = em.create(ProductVariant, {
          productId: savedProduct.id,
          sku: `SKU-${savedProduct.id}`,
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
        qb.innerJoin('product.productCategories', 'filterCat', 'filterCat.categoryId = :categoryId', {
          categoryId: query.categoryId,
        });
      }

      if (query.q) {
        qb.andWhere('product.title ILIKE :search', { search: `%${query.q}%` });
      }

      qb.orderBy('product.createdAt', 'DESC');
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

  async findById(id: string, isStorefront: boolean = false): Promise<Product> {
    return this.tenantDb.run(async (em) => {
      return this.findProductById(em, id, isStorefront);
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
            em.create(ProductCategory, { productId: id, categoryId: catId }),
          );
          await em.save(ProductCategory, pcs);
        }
      }

      // Variant update sync
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

        await em.delete(ProductVariant, { productId: id });

        if (dto.variants.length > 0) {
          let defaultSet = false;
          const newVariants = dto.variants.map((v) => {
            let isDefault = v.isDefault ?? false;
            if (isDefault) {
              if (defaultSet) {
                isDefault = false;
              } else {
                defaultSet = true;
              }
            }
            return em.create(ProductVariant, {
              productId: id,
              sku: v.sku,
              priceCents: v.priceCents,
              stock: v.stock,
              isDefault,
            });
          });
          if (!defaultSet && newVariants.length > 0) {
            newVariants[0].isDefault = true;
          }
          await em.save(ProductVariant, newVariants);
        } else {
          // If all variants removed, auto-create default variant
          const defaultVariant = em.create(ProductVariant, {
            productId: id,
            sku: `SKU-${id}`,
            priceCents: 0,
            stock: 0,
            isDefault: true,
          });
          await em.save(ProductVariant, defaultVariant);
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
}
