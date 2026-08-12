import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { EntityManager } from 'typeorm';
import { ErrorCode } from '@tiny-threads/shared';
import {
  CodedBadRequestException,
  CodedNotFoundException,
} from '../../common/errors/coded-exceptions';
import { TenantDbService } from '../../db/tenant-db.service';
import { ProductVariant } from '../../db/entities/product-variants.entity';
import { ProductVariantImage } from '../../db/entities/product-variant-images.entity';
import { STORAGE_PORT } from '../../storage/storage.port';
import type { StoragePort } from '../../storage/storage.port';
import { ImageProcessingService } from '../../storage/image-processing.service';
import { CreateProductVariantImageDto } from '../dto/create-product-variant-image.dto';
import { UpdateProductVariantImageDto } from '../dto/update-product-variant-image.dto';
import { ReorderProductVariantImagesDto } from '../dto/reorder-product-variant-images.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class ProductVariantImagesService {
  constructor(
    private readonly tenantDb: TenantDbService,
    @Inject(STORAGE_PORT)
    private readonly storagePort: StoragePort,
    private readonly imageProcessingService: ImageProcessingService,
    private readonly cls: ClsService,
  ) {}

  private async validateVariant(
    em: EntityManager,
    productId: string,
    variantId: string,
  ): Promise<ProductVariant> {
    const variant = await em.findOne(ProductVariant, {
      where: { id: variantId, productId },
    });
    if (!variant) {
      throw new CodedNotFoundException(
        ErrorCode.PRODUCT_VARIANT_NOT_FOUND,
        `Variant with ID ${variantId} not found for product ${productId}`,
      );
    }
    return variant;
  }

  async uploadImage(
    productId: string,
    variantId: string,
    file?: Express.Multer.File,
    dto?: CreateProductVariantImageDto,
  ): Promise<ProductVariantImage> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new CodedBadRequestException(
        ErrorCode.INVALID_FILE_TYPE,
        'Image file is required',
      );
    }

    const tenantId = this.cls.get<string>('tenantId');
    const imageId = randomUUID();
    const storageKey = `tenants/${tenantId}/products/${variantId}/${imageId}.webp`;

    const processed = await this.imageProcessingService.processVariantImage(
      file.buffer,
    );

    const { url } = await this.storagePort.upload({
      key: storageKey,
      buffer: processed.buffer,
      contentType: processed.contentType,
      tenantId,
    });

    return this.tenantDb.run(async (em) => {
      await this.validateVariant(em, productId, variantId);

      const existingImages = await em.find(ProductVariantImage, {
        where: { variantId },
        order: { sortOrder: 'ASC' },
      });

      const maxSortOrder =
        existingImages.length > 0
          ? Math.max(...existingImages.map((img) => img.sortOrder))
          : -1;
      const sortOrder = maxSortOrder + 1;

      const shouldBePrimary =
        existingImages.length === 0 || dto?.isPrimary === true;

      if (shouldBePrimary && existingImages.length > 0) {
        await em.update(
          ProductVariantImage,
          { variantId, isPrimary: true },
          { isPrimary: false },
        );
      }

      const image = em.create(ProductVariantImage, {
        id: imageId,
        tenantId,
        variantId,
        storageKey,
        url,
        altText: dto?.altText ?? null,
        sortOrder,
        isPrimary: shouldBePrimary,
      });

      return em.save(ProductVariantImage, image);
    });
  }

  async listImages(
    productId: string,
    variantId: string,
  ): Promise<ProductVariantImage[]> {
    return this.tenantDb.run(async (em) => {
      await this.validateVariant(em, productId, variantId);

      return em.find(ProductVariantImage, {
        where: { variantId },
        order: { sortOrder: 'ASC', createdAt: 'ASC' },
      });
    });
  }

  async updateImage(
    productId: string,
    variantId: string,
    imageId: string,
    dto: UpdateProductVariantImageDto,
  ): Promise<ProductVariantImage> {
    return this.tenantDb.run(async (em) => {
      await this.validateVariant(em, productId, variantId);

      const image = await em.findOne(ProductVariantImage, {
        where: { id: imageId, variantId },
      });

      if (!image) {
        throw new CodedNotFoundException(
          ErrorCode.PRODUCT_VARIANT_IMAGE_NOT_FOUND,
          `Product variant image with ID ${imageId} not found`,
        );
      }

      if (dto.altText !== undefined) {
        image.altText = dto.altText;
      }

      if (dto.sortOrder !== undefined) {
        image.sortOrder = dto.sortOrder;
      }

      if (dto.isPrimary === true && !image.isPrimary) {
        await em.update(
          ProductVariantImage,
          { variantId, isPrimary: true },
          { isPrimary: false },
        );
        image.isPrimary = true;
      } else if (dto.isPrimary === false) {
        image.isPrimary = false;
      }

      return em.save(ProductVariantImage, image);
    });
  }

  async deleteImage(
    productId: string,
    variantId: string,
    imageId: string,
  ): Promise<void> {
    return this.tenantDb.run(async (em) => {
      await this.validateVariant(em, productId, variantId);

      const image = await em.findOne(ProductVariantImage, {
        where: { id: imageId, variantId },
      });

      if (!image) {
        throw new CodedNotFoundException(
          ErrorCode.PRODUCT_VARIANT_IMAGE_NOT_FOUND,
          `Product variant image with ID ${imageId} not found`,
        );
      }

      const wasPrimary = image.isPrimary;

      await em.remove(ProductVariantImage, image);
      await this.storagePort.delete(image.storageKey);

      if (wasPrimary) {
        const remaining = await em.find(ProductVariantImage, {
          where: { variantId },
          order: { sortOrder: 'ASC', createdAt: 'ASC' },
        });

        if (remaining.length > 0) {
          remaining[0].isPrimary = true;
          await em.save(ProductVariantImage, remaining[0]);
        }
      }
    });
  }

  async reorderImages(
    productId: string,
    variantId: string,
    dto: ReorderProductVariantImagesDto,
  ): Promise<ProductVariantImage[]> {
    return this.tenantDb.run(async (em) => {
      await this.validateVariant(em, productId, variantId);

      const existingImages = await em.find(ProductVariantImage, {
        where: { variantId },
      });

      const imageMap = new Map(existingImages.map((img) => [img.id, img]));

      for (const id of dto.imageIds) {
        if (!imageMap.has(id)) {
          throw new CodedNotFoundException(
            ErrorCode.PRODUCT_VARIANT_IMAGE_NOT_FOUND,
            `Product variant image with ID ${id} not found`,
          );
        }
      }

      for (let i = 0; i < dto.imageIds.length; i++) {
        const img = imageMap.get(dto.imageIds[i]);
        if (img) {
          img.sortOrder = i;
          await em.save(ProductVariantImage, img);
        }
      }

      return em.find(ProductVariantImage, {
        where: { variantId },
        order: { sortOrder: 'ASC', createdAt: 'ASC' },
      });
    });
  }
}
