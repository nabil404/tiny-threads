import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import { ProductVariantImagesService } from '../services/product-variant-images.service';
import { TenantDbService } from '../../db/tenant-db.service';
import { STORAGE_PORT } from '../../storage/storage.port';
import { ImageProcessingService } from '../../storage/image-processing.service';
import {
  CodedBadRequestException,
  CodedNotFoundException,
} from '../../common/errors/coded-exceptions';
import { ErrorCode } from '@tiny-threads/shared';
import { ProductVariantImage } from '../../db/entities/product-variant-images.entity';

describe('ProductVariantImagesService', () => {
  let service: ProductVariantImagesService;
  let mockEntityManager: any;
  let mockTenantDb: any;
  let mockStoragePort: any;
  let mockImageProcessingService: any;
  let mockCls: any;

  const tenantId = 'tenant-123';
  const productId = 'prod-123';
  const variantId = 'var-123';

  beforeEach(async () => {
    mockEntityManager = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((entityClass, dto) => ({
        id: 'img-generated-id',
        ...dto,
      })),
      save: jest.fn((entityClass, entity) =>
        Promise.resolve(entity ?? entityClass),
      ),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      remove: jest.fn().mockResolvedValue({ affected: 1 }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    mockTenantDb = {
      run: jest.fn((cb) => cb(mockEntityManager)),
    };

    mockStoragePort = {
      upload: jest.fn().mockResolvedValue({
        key: `tenants/${tenantId}/products/${variantId}/img-generated-id.webp`,
        url: `https://storage.local/tenants/${tenantId}/products/${variantId}/img-generated-id.webp`,
      }),
      delete: jest.fn().mockResolvedValue(undefined),
      getUrl: jest.fn().mockReturnValue('https://storage.local/some-url'),
    };

    mockImageProcessingService = {
      processVariantImage: jest.fn().mockResolvedValue({
        buffer: Buffer.from('processed-image-data'),
        contentType: 'image/webp',
        sizeBytes: 20,
      }),
    };

    mockCls = {
      get: jest.fn().mockReturnValue(tenantId),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductVariantImagesService,
        { provide: TenantDbService, useValue: mockTenantDb },
        { provide: STORAGE_PORT, useValue: mockStoragePort },
        {
          provide: ImageProcessingService,
          useValue: mockImageProcessingService,
        },
        { provide: ClsService, useValue: mockCls },
      ],
    }).compile();

    service = module.get<ProductVariantImagesService>(
      ProductVariantImagesService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('uploadImage', () => {
    it('should throw CodedBadRequestException if file is missing', async () => {
      await expect(
        service.uploadImage(productId, variantId, undefined),
      ).rejects.toThrow(CodedBadRequestException);
    });

    it('should throw CodedNotFoundException (PRODUCT_VARIANT_NOT_FOUND) if variant does not exist', async () => {
      mockEntityManager.findOne.mockResolvedValueOnce(null);

      const fakeFile = {
        buffer: Buffer.from('raw-image'),
        size: 1000,
      } as Express.Multer.File;

      try {
        await service.uploadImage(productId, variantId, fakeFile);
        fail('Should have thrown CodedNotFoundException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(CodedNotFoundException);
        expect(err.getResponse().code).toBe(
          ErrorCode.PRODUCT_VARIANT_NOT_FOUND,
        );
        expect(mockStoragePort.upload).not.toHaveBeenCalled();
      }
    });

    it('should upload image, set sortOrder to 0 and isPrimary to true for first image', async () => {
      mockEntityManager.findOne.mockResolvedValueOnce({
        id: variantId,
        productId,
      }); // variant check
      mockEntityManager.find.mockResolvedValueOnce([]); // no existing images

      const fakeFile = {
        buffer: Buffer.from('raw-image'),
        size: 1000,
      } as Express.Multer.File;

      const result = await service.uploadImage(productId, variantId, fakeFile, {
        altText: 'First image',
      });

      expect(
        mockImageProcessingService.processVariantImage,
      ).toHaveBeenCalledWith(fakeFile.buffer);
      expect(mockStoragePort.upload).toHaveBeenCalled();
      expect(result.sortOrder).toBe(0);
      expect(result.isPrimary).toBe(true);
      expect(result.altText).toBe('First image');
    });

    it('should append sortOrder and demote previous primary image when isPrimary requested', async () => {
      mockEntityManager.findOne.mockResolvedValueOnce({
        id: variantId,
        productId,
      });
      mockEntityManager.find.mockResolvedValueOnce([
        { id: 'img-1', sortOrder: 0, isPrimary: true },
      ]);

      const fakeFile = {
        buffer: Buffer.from('raw-image'),
        size: 1000,
      } as Express.Multer.File;

      const result = await service.uploadImage(productId, variantId, fakeFile, {
        altText: 'Second image',
        isPrimary: true,
      });

      expect(mockEntityManager.update).toHaveBeenCalledWith(
        ProductVariantImage,
        { variantId, isPrimary: true },
        { isPrimary: false },
      );
      expect(result.sortOrder).toBe(1);
      expect(result.isPrimary).toBe(true);
    });
  });

  describe('listImages', () => {
    it('should return images ordered by sortOrder ASC', async () => {
      mockEntityManager.findOne.mockResolvedValueOnce({
        id: variantId,
        productId,
      });
      const existingImages = [
        { id: 'img-1', sortOrder: 0, isPrimary: true },
        { id: 'img-2', sortOrder: 1, isPrimary: false },
      ];
      mockEntityManager.find.mockResolvedValueOnce(existingImages);

      const result = await service.listImages(productId, variantId);
      expect(result).toEqual(existingImages);
      expect(mockEntityManager.find).toHaveBeenCalledWith(
        ProductVariantImage,
        expect.objectContaining({
          where: { variantId },
          order: { sortOrder: 'ASC', createdAt: 'ASC' },
        }),
      );
    });

    it('should throw CodedNotFoundException (PRODUCT_VARIANT_NOT_FOUND) if variant does not exist', async () => {
      mockEntityManager.findOne.mockResolvedValueOnce(null);

      try {
        await service.listImages(productId, variantId);
        fail('Should have thrown CodedNotFoundException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(CodedNotFoundException);
        expect(err.getResponse().code).toBe(
          ErrorCode.PRODUCT_VARIANT_NOT_FOUND,
        );
      }
    });
  });

  describe('updateImage', () => {
    it('should update altText, sortOrder, and demote previous primary when setting isPrimary = true', async () => {
      mockEntityManager.findOne
        .mockResolvedValueOnce({ id: variantId, productId }) // variant check
        .mockResolvedValueOnce({
          id: 'img-2',
          variantId,
          altText: 'Old',
          sortOrder: 1,
          isPrimary: false,
        }); // image check

      const result = await service.updateImage(productId, variantId, 'img-2', {
        altText: 'New Alt',
        isPrimary: true,
        sortOrder: 0,
      });

      expect(mockEntityManager.update).toHaveBeenCalledWith(
        ProductVariantImage,
        { variantId, isPrimary: true },
        { isPrimary: false },
      );
      expect(result.altText).toBe('New Alt');
      expect(result.isPrimary).toBe(true);
      expect(result.sortOrder).toBe(0);
      expect(mockEntityManager.save).toHaveBeenCalled();
    });

    it('should throw CodedNotFoundException (PRODUCT_VARIANT_IMAGE_NOT_FOUND) if image not found', async () => {
      mockEntityManager.findOne
        .mockResolvedValueOnce({ id: variantId, productId }) // variant check
        .mockResolvedValueOnce(null); // image check

      try {
        await service.updateImage(productId, variantId, 'non-existent-img', {
          altText: 'Test',
        });
        fail('Should have thrown CodedNotFoundException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(CodedNotFoundException);
        expect(err.getResponse().code).toBe(
          ErrorCode.PRODUCT_VARIANT_IMAGE_NOT_FOUND,
        );
      }
    });
  });

  describe('deleteImage', () => {
    it('should delete non-primary image without auto-promoting another', async () => {
      const targetImage = {
        id: 'img-2',
        variantId,
        storageKey: `tenants/${tenantId}/products/${variantId}/img-2.webp`,
        isPrimary: false,
      };

      mockEntityManager.findOne
        .mockResolvedValueOnce({ id: variantId, productId })
        .mockResolvedValueOnce(targetImage);

      await service.deleteImage(productId, variantId, 'img-2');

      expect(mockEntityManager.remove).toHaveBeenCalledWith(
        ProductVariantImage,
        targetImage,
      );
      expect(mockStoragePort.delete).toHaveBeenCalledWith(
        targetImage.storageKey,
      );
      expect(mockEntityManager.save).not.toHaveBeenCalled();
    });

    it('should delete primary image and auto-promote next remaining image to primary', async () => {
      const primaryImage = {
        id: 'img-1',
        variantId,
        storageKey: `tenants/${tenantId}/products/${variantId}/img-1.webp`,
        isPrimary: true,
      };
      const nextImage = {
        id: 'img-2',
        variantId,
        sortOrder: 1,
        isPrimary: false,
      };

      mockEntityManager.findOne
        .mockResolvedValueOnce({ id: variantId, productId })
        .mockResolvedValueOnce(primaryImage);

      mockEntityManager.find.mockResolvedValueOnce([nextImage]);

      await service.deleteImage(productId, variantId, 'img-1');

      expect(mockEntityManager.remove).toHaveBeenCalledWith(
        ProductVariantImage,
        primaryImage,
      );
      expect(mockStoragePort.delete).toHaveBeenCalledWith(
        primaryImage.storageKey,
      );
      expect(nextImage.isPrimary).toBe(true);
      expect(mockEntityManager.save).toHaveBeenCalledWith(
        ProductVariantImage,
        nextImage,
      );
    });

    it('should throw CodedNotFoundException (PRODUCT_VARIANT_IMAGE_NOT_FOUND) if image does not exist', async () => {
      mockEntityManager.findOne
        .mockResolvedValueOnce({ id: variantId, productId })
        .mockResolvedValueOnce(null);

      try {
        await service.deleteImage(productId, variantId, 'non-existent');
        fail('Should have thrown CodedNotFoundException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(CodedNotFoundException);
        expect(err.getResponse().code).toBe(
          ErrorCode.PRODUCT_VARIANT_IMAGE_NOT_FOUND,
        );
      }
    });
  });

  describe('reorderImages', () => {
    it('should reorder images according to array order in transaction', async () => {
      const img1 = { id: 'img-1', variantId, sortOrder: 0 };
      const img2 = { id: 'img-2', variantId, sortOrder: 1 };

      mockEntityManager.findOne.mockResolvedValueOnce({
        id: variantId,
        productId,
      });
      mockEntityManager.find
        .mockResolvedValueOnce([img1, img2]) // initial fetch
        .mockResolvedValueOnce([img2, img1]); // final return

      const result = await service.reorderImages(productId, variantId, {
        imageIds: ['img-2', 'img-1'],
      });

      expect(img2.sortOrder).toBe(0);
      expect(img1.sortOrder).toBe(1);
      expect(mockEntityManager.save).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result).toHaveLength(2);
    });

    it('should throw CodedBadRequestException if imageIds contains duplicates or count mismatch', async () => {
      const img1 = { id: 'img-1', variantId, sortOrder: 0 };
      const img2 = { id: 'img-2', variantId, sortOrder: 1 };

      mockEntityManager.findOne.mockResolvedValueOnce({
        id: variantId,
        productId,
      });
      mockEntityManager.find.mockResolvedValueOnce([img1, img2]);

      try {
        await service.reorderImages(productId, variantId, {
          imageIds: ['img-1', 'img-1'],
        });
        fail('Should have thrown CodedBadRequestException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(CodedBadRequestException);
        expect(err.getResponse().code).toBe(ErrorCode.VALIDATION_FAILED);
        expect(err.getResponse().message).toBe(
          'Image IDs must contain all and only existing images for this variant without duplicates',
        );
      }
    });

    it('should throw CodedNotFoundException (PRODUCT_VARIANT_IMAGE_NOT_FOUND) if an imageId is invalid', async () => {
      const img1 = { id: 'img-1', variantId, sortOrder: 0 };
      const img2 = { id: 'img-2', variantId, sortOrder: 1 };

      mockEntityManager.findOne.mockResolvedValueOnce({
        id: variantId,
        productId,
      });
      mockEntityManager.find.mockResolvedValueOnce([img1, img2]);

      try {
        await service.reorderImages(productId, variantId, {
          imageIds: ['img-1', 'img-missing'],
        });
        fail('Should have thrown CodedNotFoundException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(CodedNotFoundException);
        expect(err.getResponse().code).toBe(
          ErrorCode.PRODUCT_VARIANT_IMAGE_NOT_FOUND,
        );
      }
    });
  });
});
