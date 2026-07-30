import { ProductsService } from '../products.service';
import { TenantDbService } from '../../db/tenant-db.service';
import {
  CodedBadRequestException,
  CodedConflictException,
  CodedNotFoundException,
} from '../../common/errors/coded-exceptions';

describe('ProductsService', () => {
  let service: ProductsService;
  let tenantDbService: jest.Mocked<TenantDbService>;

  beforeEach(() => {
    tenantDbService = {
      run: jest.fn(),
    } as unknown as jest.Mocked<TenantDbService>;
    service = new ProductsService(tenantDbService);
  });

  describe('create', () => {
    it('auto-creates default variant with full product ID SKU if no variants are provided on create', async () => {
      let savedVariant: any;
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          save: jest.fn().mockImplementation((entityOrClass, entity) => {
            const item = entity || entityOrClass;
            if (item.sku) savedVariant = item;
            return Promise.resolve({ id: 'prod-12345678-abcd', ...item });
          }),
          create: jest.fn().mockImplementation((entityClass, entity) => entity),
          findOne: jest.fn().mockResolvedValue({ id: 'prod-12345678-abcd', status: 'active', variants: [] }),
          find: jest.fn().mockResolvedValue([]),
        };
        return cb(em as any);
      });

      const result = await service.create({ title: 'Basic Tee', status: 'active' });
      expect(result).toBeDefined();
      expect(savedVariant).toBeDefined();
      expect(savedVariant.sku).toEqual('SKU-prod-12345678-abcd');
      expect(savedVariant.isDefault).toBe(true);
    });

    it('ensures only the first variant with isDefault=true retains true when custom variants are supplied', async () => {
      let savedVariants: any[];
      tenantDbService.run.mockImplementation(async (cb) => {
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
        return cb(em as any);
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
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          find: jest.fn().mockResolvedValue([{ id: 'cat-1' }]), // only 1 of 2 found
        };
        return cb(em as any);
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
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          find: jest.fn().mockResolvedValue([{ id: 'cat-1' }]),
          create: jest.fn().mockImplementation((_, entity) => entity),
          save: jest.fn().mockResolvedValue({ id: 'prod-1' }),
        };
        return cb(em as any);
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
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          find: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockImplementation((_, entity) => entity),
          save: jest.fn().mockResolvedValue({ id: 'prod-1' }),
          findOne: jest.fn().mockResolvedValue({ id: 'v-99', sku: 'TSHIRT-RED' }),
        };
        return cb(em as any);
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
        variants: [{ id: 'v-1', sku: 'TSHIRT-S', priceCents: 1500, stock: 10, isDefault: true }],
        productCategories: [{ productId: 'prod-1', categoryId: 'cat-1' }],
      };

      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          find: jest.fn().mockResolvedValue([{ id: 'cat-1' }]),
          create: jest.fn().mockImplementation((_, entity) => entity),
          save: jest.fn().mockImplementation((_, entity) => Promise.resolve(entity)),
          findOne: jest.fn().mockImplementation((entityClass, options) => {
            if (options.where?.sku) return Promise.resolve(null);
            return Promise.resolve(mockProduct);
          }),
        };
        return cb(em as any);
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

  describe('findAll', () => {
    it('returns paginated products list with category filter inner join', async () => {
      const mockProducts = [{ id: 'prod-1', title: 'Tee' }];
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockProducts, 1]),
      };

      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          createQueryBuilder: jest.fn().mockReturnValue(mockQb),
        };
        return cb(em as any);
      });

      const result = await service.findAll({ page: 1, limit: 10, status: 'active', categoryId: 'cat-1', q: 'Tee' });
      expect(result).toEqual({
        items: mockProducts,
        total: 1,
        page: 1,
        limit: 10,
      });
      expect(mockQb.andWhere).toHaveBeenCalledWith('product.status = :status', { status: 'active' });
      expect(mockQb.innerJoin).toHaveBeenCalledWith('product.productCategories', 'filterCat', 'filterCat.categoryId = :categoryId', { categoryId: 'cat-1' });
      expect(mockQb.andWhere).toHaveBeenCalledWith('product.title ILIKE :search', { search: '%Tee%' });
    });

    it('uses default pagination values page=1 and limit=20 if query parameters are omitted', async () => {
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      tenantDbService.run.mockImplementation(async (cb) => {
        const em = { createQueryBuilder: jest.fn().mockReturnValue(mockQb) };
        return cb(em as any);
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
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      tenantDbService.run.mockImplementation(async (cb) => {
        const em = { createQueryBuilder: jest.fn().mockReturnValue(mockQb) };
        return cb(em as any);
      });

      await service.findAll({ page: 1, limit: 10 }, true);
      expect(mockQb.andWhere).toHaveBeenCalledWith('product.status = :activeStatus', { activeStatus: 'active' });
    });
  });

  describe('findById', () => {
    it('returns product when found', async () => {
      const mockProduct = { id: 'prod-1', title: 'Tee', status: 'active' };
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = { findOne: jest.fn().mockResolvedValue(mockProduct) };
        return cb(em as any);
      });

      const result = await service.findById('prod-1');
      expect(result).toEqual(mockProduct);
    });

    it('throws CodedNotFoundException when product does not exist', async () => {
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = { findOne: jest.fn().mockResolvedValue(null) };
        return cb(em as any);
      });

      await expect(service.findById('prod-nonexistent')).rejects.toThrow(CodedNotFoundException);
    });

    it('throws CodedNotFoundException on storefront call if product is draft', async () => {
      const mockProduct = { id: 'prod-1', title: 'Draft Tee', status: 'draft' };
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = { findOne: jest.fn().mockResolvedValue(mockProduct) };
        return cb(em as any);
      });

      await expect(service.findById('prod-1', true)).rejects.toThrow(CodedNotFoundException);
    });
  });

  describe('update', () => {
    it('updates product basic details, categories, and variants without nested tenantDb.run calls', async () => {
      const existingProduct = { id: 'prod-1', title: 'Old Tee', status: 'draft' };
      const updatedProduct = { id: 'prod-1', title: 'New Tee', status: 'active' };

      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest.fn().mockImplementation((entityClass, options) => {
            if (options.where?.sku) return Promise.resolve(null);
            if (options.where?.id === 'prod-1') return Promise.resolve(existingProduct);
            return Promise.resolve(updatedProduct);
          }),
          find: jest.fn().mockResolvedValue([{ id: 'cat-2' }]),
          save: jest.fn().mockImplementation((_, entity) => Promise.resolve(entity)),
          delete: jest.fn().mockResolvedValue({ affected: 1 }),
          create: jest.fn().mockImplementation((_, entity) => entity),
        };
        return cb(em as any);
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
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = { findOne: jest.fn().mockResolvedValue(null) };
        return cb(em as any);
      });

      await expect(service.update('prod-nonexistent', { title: 'New' })).rejects.toThrow(
        CodedNotFoundException,
      );
    });
  });

  describe('delete', () => {
    it('soft deletes product by setting status to archived', async () => {
      const existingProduct = { id: 'prod-1', title: 'Tee', status: 'active' };
      let savedProduct: any;

      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest.fn().mockResolvedValue(existingProduct),
          save: jest.fn().mockImplementation((_, entity) => {
            savedProduct = entity;
            return Promise.resolve(entity);
          }),
        };
        return cb(em as any);
      });

      await service.delete('prod-1');
      expect(savedProduct.status).toEqual('archived');
    });

    it('throws CodedNotFoundException when deleting non-existent product', async () => {
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = { findOne: jest.fn().mockResolvedValue(null) };
        return cb(em as any);
      });

      await expect(service.delete('prod-nonexistent')).rejects.toThrow(CodedNotFoundException);
    });
  });
});
