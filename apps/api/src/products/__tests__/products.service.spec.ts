/* eslint-disable @typescript-eslint/unbound-method */
import { ProductsService } from '../services/products.service';
import { TenantDbService } from '../../db/tenant-db.service';
import { ClsService } from 'nestjs-cls';
import {
  CodedBadRequestException,
  CodedConflictException,
  CodedNotFoundException,
} from '../../common/errors/coded-exceptions';

import { StoragePort } from '../../storage/storage.port';
import { ImageProcessingService } from '../../storage/image-processing.service';

describe('ProductsService', () => {
  let service: ProductsService;
  let tenantDbService: jest.Mocked<TenantDbService>;
  let clsService: jest.Mocked<ClsService>;
  let storagePort: jest.Mocked<StoragePort>;
  let imageProcessingService: jest.Mocked<ImageProcessingService>;

  beforeEach(() => {
    tenantDbService = {
      run: jest.fn(),
    } as unknown as jest.Mocked<TenantDbService>;
    clsService = {
      get: jest.fn().mockReturnValue('tenant-123'),
    } as unknown as jest.Mocked<ClsService>;
    storagePort = {
      upload: jest.fn().mockResolvedValue({ url: 'http://cdn.test/img.webp' }),
      getSignedUrl: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<StoragePort>;
    imageProcessingService = {
      processVariantImage: jest.fn().mockResolvedValue({
        buffer: Buffer.from('processed'),
        contentType: 'image/webp',
      }),
    } as unknown as jest.Mocked<ImageProcessingService>;

    service = new ProductsService(
      tenantDbService,
      clsService,
      storagePort,
      imageProcessingService,
    );
  });

  describe('create', () => {
    it('auto-creates default variant with full product ID SKU if no variants are provided on create', async () => {
      let savedVariant: any;
      tenantDbService.run.mockImplementation(async (cb: any) => {
        const em = {
          save: jest.fn().mockImplementation((entityOrClass, entity) => {
            const item = entity || entityOrClass;
            if (item.sku) savedVariant = item;
            return Promise.resolve({ id: 'prod-12345678-abcd', ...item });
          }),
          create: jest.fn().mockImplementation((entityClass, entity) => entity),
          findOne: jest.fn().mockResolvedValue({
            id: 'prod-12345678-abcd',
            status: 'active',
            variants: [],
          }),
          find: jest.fn().mockResolvedValue([]),
        };
        return await cb(em as any);
      });

      const result = await service.create({
        title: 'Basic Tee',
        status: 'active',
      });
      expect(result).toBeDefined();
      expect(savedVariant).toBeDefined();
      expect(savedVariant.sku).toEqual('SKU-prod-12345678-abcd');
      expect(savedVariant.isDefault).toBe(true);
    });

    it('ensures only the first variant with isDefault=true retains true when custom variants are supplied', async () => {
      let savedVariants: any[];
      tenantDbService.run.mockImplementation(async (cb: any) => {
        const em = {
          save: jest.fn().mockImplementation((entityOrClass, entity) => {
            const item = entity || entityOrClass;
            if (Array.isArray(item)) savedVariants = item;
            return Promise.resolve({ id: 'prod-1', ...item });
          }),
          create: jest.fn().mockImplementation((entityClass, entity) => entity),
          findOne: jest.fn().mockImplementation((entityClass, options) => {
            if (options.where?.sku) return Promise.resolve(null);
            return Promise.resolve({ id: 'prod-1', status: 'active' });
          }),
          find: jest.fn().mockResolvedValue([]),
        };
        return await cb(em as any);
      });

      await service.create({
        title: 'Multi-variant Tee',
        status: 'active',
        variants: [
          { sku: 'SKU-1', priceCents: 1000, stock: 5, isDefault: true },
          { sku: 'SKU-2', priceCents: 1200, stock: 10, isDefault: true },
        ],
      });

      expect(savedVariants).toHaveLength(2);
      expect(savedVariants[0].isDefault).toBe(true);
      expect(savedVariants[1].isDefault).toBe(false);
    });

    it('throws CodedBadRequestException if one or more provided category IDs do not exist', async () => {
      tenantDbService.run.mockImplementation(async (cb: any) => {
        const em = {
          find: jest.fn().mockResolvedValue([{ id: 'cat-1' }]), // only 1 of 2 found
        };
        return await cb(em as any);
      });

      await expect(
        service.create({
          title: 'Basic Tee',
          status: 'active',
          categoryIds: ['cat-1', 'cat-2'],
        }),
      ).rejects.toThrow(CodedBadRequestException);
    });

    it('throws CodedBadRequestException if duplicate SKUs are present in payload', async () => {
      tenantDbService.run.mockImplementation(async (cb: any) => {
        const em = {
          find: jest.fn().mockResolvedValue([{ id: 'cat-1' }]),
          create: jest.fn().mockImplementation((_, entity) => entity),
          save: jest.fn().mockResolvedValue({ id: 'prod-1' }),
        };
        return await cb(em as any);
      });

      await expect(
        service.create({
          title: 'Basic Tee',
          status: 'active',
          categoryIds: ['cat-1'],
          variants: [
            { sku: 'TSHIRT-RED', priceCents: 1000, stock: 5 },
            { sku: 'TSHIRT-RED', priceCents: 1200, stock: 10 },
          ],
        }),
      ).rejects.toThrow(CodedBadRequestException);
    });

    it('throws CodedConflictException if a variant SKU already exists in DB', async () => {
      tenantDbService.run.mockImplementation(async (cb: any) => {
        const em = {
          find: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockImplementation((_, entity) => entity),
          save: jest.fn().mockResolvedValue({ id: 'prod-1' }),
          findOne: jest
            .fn()
            .mockResolvedValue({ id: 'v-99', sku: 'TSHIRT-RED' }),
        };
        return await cb(em as any);
      });

      await expect(
        service.create({
          title: 'Basic Tee',
          status: 'active',
          variants: [{ sku: 'TSHIRT-RED', priceCents: 1000, stock: 5 }],
        }),
      ).rejects.toThrow(CodedConflictException);
    });

    it('creates product with custom variants and category associations', async () => {
      const mockProduct = {
        id: 'prod-1',
        title: 'Basic Tee',
        status: 'active',
        variants: [
          {
            id: 'v-1',
            sku: 'TSHIRT-S',
            priceCents: 1500,
            stock: 10,
            isDefault: true,
          },
        ],
        productCategories: [{ productId: 'prod-1', categoryId: 'cat-1' }],
      };

      tenantDbService.run.mockImplementation(async (cb: any) => {
        const em = {
          find: jest.fn().mockResolvedValue([{ id: 'cat-1' }]),
          create: jest.fn().mockImplementation((_, entity) => entity),
          save: jest
            .fn()
            .mockImplementation((_, entity) => Promise.resolve(entity)),
          findOne: jest.fn().mockImplementation((entityClass, options) => {
            if (options.where?.sku) return Promise.resolve(null);
            return Promise.resolve(mockProduct);
          }),
        };
        return await cb(em as any);
      });

      const result = await service.create({
        title: 'Basic Tee',
        status: 'active',
        categoryIds: ['cat-1'],
        variants: [{ sku: 'TSHIRT-S', priceCents: 1500, stock: 10 }],
      });

      expect(result).toEqual(mockProduct);
    });
  });

  describe('createWithImages', () => {
    it('processes images, creates product, uploads to storage, and saves ProductVariantImage entities', async () => {
      const mockProduct = {
        id: 'prod-1',
        title: 'Tee with images',
        status: 'active',
        variants: [{ id: 'var-1', sku: 'SKU-IMG-1' }],
      };

      const savedVariantImages: any[] = [];
      tenantDbService.run.mockImplementation(async (cb: any) => {
        const em = {
          find: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockImplementation((_, entity) => entity),
          save: jest.fn().mockImplementation((entityClassOrObject, entity) => {
            const target = entity || entityClassOrObject;
            if (target.storageKey) {
              savedVariantImages.push(target);
            }
            if (Array.isArray(target) && target.length > 0 && target[0].sku) {
              return Promise.resolve(target);
            }
            return Promise.resolve({ id: 'prod-1', ...target });
          }),
          findOne: jest.fn().mockImplementation((entityClass, options) => {
            if (options?.where?.sku) return Promise.resolve(null);
            return Promise.resolve(mockProduct);
          }),
        };
        return await cb(em as any);
      });

      const fileMap = new Map<number, Express.Multer.File[]>();
      fileMap.set(0, [
        { buffer: Buffer.from('img1'), originalname: '1.jpg' } as any,
        { buffer: Buffer.from('img2'), originalname: '2.jpg' } as any,
      ]);

      const result = await service.createWithImages(
        {
          title: 'Tee with images',
          status: 'active',
          variants: [{ sku: 'SKU-IMG-1', priceCents: 1000, stock: 5 }],
        },
        fileMap,
      );

      expect(result).toEqual(mockProduct);
      expect(imageProcessingService.processVariantImage).toHaveBeenCalledTimes(
        2,
      );
      expect(storagePort.upload).toHaveBeenCalledTimes(2);
      expect(savedVariantImages).toHaveLength(2);
      expect(savedVariantImages[0].isPrimary).toBe(true);
      expect(savedVariantImages[0].sortOrder).toBe(0);
      expect(savedVariantImages[1].isPrimary).toBe(false);
      expect(savedVariantImages[1].sortOrder).toBe(1);
    });
  });

  describe('findAll', () => {
    it('returns paginated products list with category filter inner join', async () => {
      const mockProducts = [{ id: 'prod-1', title: 'Tee' }];
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockProducts, 1]),
      };

      tenantDbService.run.mockImplementation(async (cb: any) => {
        const em = {
          createQueryBuilder: jest.fn().mockReturnValue(mockQb),
        };
        return await cb(em as any);
      });

      const result = await service.findAll({
        page: 1,
        limit: 10,
        status: 'active',
        categoryId: 'cat-1',
        q: 'Tee',
      });
      expect(result).toEqual({
        items: mockProducts,
        total: 1,
        page: 1,
        limit: 10,
      });
      expect(mockQb.andWhere).toHaveBeenCalledWith('product.status = :status', {
        status: 'active',
      });
      expect(mockQb.innerJoin).toHaveBeenCalledWith(
        'product.productCategories',
        'filterCat',
        'filterCat.categoryId = :categoryId',
        { categoryId: 'cat-1' },
      );
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'product.title ILIKE :search',
        { search: '%Tee%' },
      );
    });

    it('uses default pagination values page=1 and limit=20 if query parameters are omitted', async () => {
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      tenantDbService.run.mockImplementation(async (cb: any) => {
        const em = { createQueryBuilder: jest.fn().mockReturnValue(mockQb) };
        return await cb(em as any);
      });

      const result = await service.findAll({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(mockQb.skip).toHaveBeenCalledWith(0);
      expect(mockQb.take).toHaveBeenCalledWith(20);
    });

    it('filters storefront products to only active ones', async () => {
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      tenantDbService.run.mockImplementation(async (cb: any) => {
        const em = { createQueryBuilder: jest.fn().mockReturnValue(mockQb) };
        return await cb(em as any);
      });

      await service.findAll({ page: 1, limit: 10 }, true);
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'product.status = :activeStatus',
        { activeStatus: 'active' },
      );
    });
  });

  describe('findById', () => {
    it('returns product when found', async () => {
      const mockProduct = { id: 'prod-1', title: 'Tee', status: 'active' };
      tenantDbService.run.mockImplementation(async (cb: any) => {
        const em = { findOne: jest.fn().mockResolvedValue(mockProduct) };
        return await cb(em as any);
      });

      const result = await service.findById('prod-1');
      expect(result).toEqual(mockProduct);
    });

    it('throws CodedNotFoundException when product does not exist', async () => {
      tenantDbService.run.mockImplementation(async (cb: any) => {
        const em = { findOne: jest.fn().mockResolvedValue(null) };
        return await cb(em as any);
      });

      await expect(service.findById('prod-nonexistent')).rejects.toThrow(
        CodedNotFoundException,
      );
    });

    it('throws CodedNotFoundException on storefront call if product is draft', async () => {
      const mockProduct = { id: 'prod-1', title: 'Draft Tee', status: 'draft' };
      tenantDbService.run.mockImplementation(async (cb: any) => {
        const em = { findOne: jest.fn().mockResolvedValue(mockProduct) };
        return await cb(em as any);
      });

      await expect(service.findById('prod-1', true)).rejects.toThrow(
        CodedNotFoundException,
      );
    });
  });

  describe('findStorefrontProducts and findStorefrontProductById', () => {
    it('findStorefrontProducts delegates to findAll with storefront = true and loads variant images ordered by sortOrder ASC', async () => {
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      tenantDbService.run.mockImplementation(async (cb: any) => {
        const em = { createQueryBuilder: jest.fn().mockReturnValue(mockQb) };
        return await cb(em as any);
      });

      const res = await service.findStorefrontProducts({ page: 1, limit: 10 });
      expect(res).toBeDefined();
      expect(mockQb.leftJoinAndSelect).toHaveBeenCalledWith(
        'variant.images',
        'variantImage',
      );
      expect(mockQb.addOrderBy).toHaveBeenCalledWith(
        'variantImage.sortOrder',
        'ASC',
      );
    });

    it('findStorefrontProductById delegates to findById with storefront = true', async () => {
      const mockProduct = {
        id: 'prod-100',
        title: 'Storefront Item',
        status: 'active',
      };
      let findOneOptions: any;
      tenantDbService.run.mockImplementation(async (cb: any) => {
        const em = {
          findOne: jest.fn().mockImplementation((_, opts) => {
            findOneOptions = opts;
            return Promise.resolve(mockProduct);
          }),
        };
        return await cb(em as any);
      });

      const res = await service.findStorefrontProductById('prod-100');
      expect(res).toEqual(mockProduct);
      expect(findOneOptions.relations).toEqual({
        variants: { images: true },
        productCategories: { category: true },
      });
      expect(findOneOptions.order).toEqual({
        variants: { images: { sortOrder: 'ASC' } },
      });
    });
  });

  describe('update', () => {
    it('updates product basic details, categories, and variants without nested tenantDb.run calls', async () => {
      const existingProduct = {
        id: 'prod-1',
        title: 'Old Tee',
        status: 'draft',
      };
      const updatedProduct = {
        id: 'prod-1',
        title: 'New Tee',
        status: 'active',
      };

      tenantDbService.run.mockImplementation(async (cb: any) => {
        const em = {
          findOne: jest.fn().mockImplementation((entityClass, options) => {
            if (options.where?.sku) return Promise.resolve(null);
            if (options.where?.id === 'prod-1')
              return Promise.resolve(existingProduct);
            return Promise.resolve(updatedProduct);
          }),
          find: jest.fn().mockResolvedValue([{ id: 'cat-2' }]),
          save: jest
            .fn()
            .mockImplementation((_, entity) => Promise.resolve(entity)),
          delete: jest.fn().mockResolvedValue({ affected: 1 }),
          create: jest.fn().mockImplementation((_, entity) => entity),
        };
        return await cb(em as any);
      });

      const result = await service.update('prod-1', {
        title: 'New Tee',
        status: 'active',
        categoryIds: ['cat-2'],
        variants: [{ sku: 'NEW-SKU', priceCents: 2000, stock: 10 }],
      });

      expect(result).toBeDefined();
      expect(tenantDbService.run).toHaveBeenCalledTimes(1);
    });

    it('throws CodedNotFoundException when updating non-existent product', async () => {
      tenantDbService.run.mockImplementation(async (cb: any) => {
        const em = { findOne: jest.fn().mockResolvedValue(null) };
        return await cb(em as any);
      });

      await expect(
        service.update('prod-nonexistent', { title: 'New' }),
      ).rejects.toThrow(CodedNotFoundException);
    });
  });

  describe('delete', () => {
    it('soft deletes product by setting status to archived', async () => {
      const existingProduct = { id: 'prod-1', title: 'Tee', status: 'active' };
      let savedProduct: any;

      tenantDbService.run.mockImplementation(async (cb: any) => {
        const em = {
          findOne: jest.fn().mockResolvedValue(existingProduct),
          save: jest.fn().mockImplementation((_, entity) => {
            savedProduct = entity;
            return Promise.resolve(entity);
          }),
        };
        return await cb(em as any);
      });

      await service.delete('prod-1');
      expect(savedProduct.status).toEqual('archived');
    });

    it('stamps tenantId from ClsService on created entities', async () => {
      let createdProduct: any;
      tenantDbService.run.mockImplementation(async (cb: any) => {
        const em = {
          find: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockImplementation((_, entity) => entity),
          save: jest.fn().mockImplementation((_, entity) => {
            if (entity.title) createdProduct = entity;
            return Promise.resolve({ id: 'prod-tenant-1', ...entity });
          }),
          findOne: jest.fn().mockResolvedValue({
            id: 'prod-tenant-1',
            title: 'Tenant Tee',
            status: 'active',
            variants: [],
          }),
        };
        return await cb(em as any);
      });

      await service.create({ title: 'Tenant Tee', status: 'active' });
      expect(createdProduct).toBeDefined();
      expect(createdProduct.tenantId).toBe('tenant-123');
    });

    it('translates Postgres 23505 unique violation error to CodedConflictException', async () => {
      tenantDbService.run.mockImplementation(async (cb: any) => {
        const em = {
          find: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockImplementation((_, entity) => entity),
          save: jest.fn().mockRejectedValue({
            code: '23505',
            message: 'duplicate key value violates unique constraint',
          }),
        };
        return await cb(em as any);
      });

      await expect(
        service.create({ title: 'Duplicate Tee', status: 'active' }),
      ).rejects.toThrow(CodedConflictException);
    });

    it('preserves existing variant ID when updating an existing variant in update()', async () => {
      const existingProduct = { id: 'prod-1', title: 'Tee', status: 'active' };
      const existingVariant = {
        id: 'var-123',
        productId: 'prod-1',
        sku: 'SKU-OLD',
        priceCents: 1000,
        stock: 5,
        isDefault: true,
      };

      let savedVariants: any[];

      tenantDbService.run.mockImplementation(async (cb: any) => {
        const em = {
          findOne: jest.fn().mockImplementation((entityClass, options) => {
            if (options?.where?.sku) return Promise.resolve(null);
            return Promise.resolve(existingProduct);
          }),
          find: jest.fn().mockImplementation((entityClass, options) => {
            if (
              entityClass.name === 'ProductVariant' ||
              options?.where?.productId
            ) {
              return Promise.resolve([existingVariant]);
            }
            return Promise.resolve([]);
          }),
          save: jest.fn().mockImplementation((entityClass, entity) => {
            if (Array.isArray(entity)) {
              savedVariants = entity;
            }
            return Promise.resolve(entity);
          }),
          delete: jest.fn().mockResolvedValue({ affected: 0 }),
          create: jest.fn().mockImplementation((_, entity) => entity),
        };
        return await cb(em as any);
      });

      await service.update('prod-1', {
        variants: [
          {
            id: 'var-123',
            sku: 'SKU-OLD',
            priceCents: 1500,
            stock: 10,
            isDefault: true,
          },
        ],
      });

      expect(savedVariants).toBeDefined();
      expect(savedVariants.length).toBe(1);
      expect(savedVariants[0].id).toBe('var-123');
      expect(savedVariants[0].priceCents).toBe(1500);
    });

    it('throws CodedNotFoundException when deleting non-existent product', async () => {
      tenantDbService.run.mockImplementation(async (cb: any) => {
        const em = { findOne: jest.fn().mockResolvedValue(null) };
        return await cb(em as any);
      });

      await expect(service.delete('prod-nonexistent')).rejects.toThrow(
        CodedNotFoundException,
      );
    });
  });
});
