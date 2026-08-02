import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from '../services/products.service';
import { TenantDbService } from '../../db/tenant-db.service';
import { ClsService } from 'nestjs-cls';
import { ErrorCode } from '@tiny-threads/shared';
import {
  CodedNotFoundException,
  CodedBadRequestException,
  CodedConflictException,
} from '../../common/errors/coded-exceptions';
import { Product } from '../../db/entities/products.entity';
import { ProductVariant } from '../../db/entities/product-variants.entity';

describe('ProductsService - Single Variant Operations', () => {
  let service: ProductsService;
  let mockEntityManager: any;
  let mockTenantDb: any;
  let mockCls: any;

  beforeEach(async () => {
    mockEntityManager = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((entityClass, dto) => ({ ...dto, id: 'var-generated-id' })),
      save: jest.fn((entityClass, entity) => Promise.resolve(entity)),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      count: jest.fn(),
    };

    mockTenantDb = {
      run: jest.fn((cb) => cb(mockEntityManager)),
    };

    mockCls = {
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

  describe('createVariant', () => {
    it('should create a variant successfully', async () => {
      mockEntityManager.findOne
        .mockResolvedValueOnce({ id: 'prod-1' } as Product) // product check
        .mockResolvedValueOnce(null); // SKU check

      const dto = { sku: 'SKU-1', priceCents: 1000, stock: 10, isDefault: true };
      const result = await service.createVariant('prod-1', dto);

      expect(mockEntityManager.update).toHaveBeenCalledWith(
        ProductVariant,
        { productId: 'prod-1' },
        { isDefault: false },
      );
      expect(result).toBeDefined();
      expect(result.sku).toBe('SKU-1');
    });

    it('should throw CodedNotFoundException if product does not exist', async () => {
      mockEntityManager.findOne.mockResolvedValueOnce(null);

      await expect(
        service.createVariant('non-existent', { sku: 'SKU-1', priceCents: 1000, stock: 10 }),
      ).rejects.toThrow(CodedNotFoundException);
    });

    it('should throw CodedConflictException if SKU already exists', async () => {
      mockEntityManager.findOne
        .mockResolvedValueOnce({ id: 'prod-1' } as Product)
        .mockResolvedValueOnce({ id: 'existing-var', sku: 'SKU-1' });

      await expect(
        service.createVariant('prod-1', { sku: 'SKU-1', priceCents: 1000, stock: 10 }),
      ).rejects.toThrow(CodedConflictException);
    });
  });

  describe('findVariantsByProduct', () => {
    it('should return list of variants for product', async () => {
      mockEntityManager.findOne.mockResolvedValueOnce({ id: 'prod-1' } as Product);
      mockEntityManager.find.mockResolvedValueOnce([
        { id: 'var-1', sku: 'SKU-1' },
        { id: 'var-2', sku: 'SKU-2' },
      ]);

      const result = await service.findVariantsByProduct('prod-1');
      expect(result).toHaveLength(2);
    });

    it('should throw CodedNotFoundException if product does not exist', async () => {
      mockEntityManager.findOne.mockResolvedValueOnce(null);

      await expect(service.findVariantsByProduct('non-existent')).rejects.toThrow(
        CodedNotFoundException,
      );
    });
  });

  describe('findVariantById', () => {
    it('should return a single variant by id', async () => {
      mockEntityManager.findOne.mockResolvedValueOnce({ id: 'var-1', productId: 'prod-1' });

      const result = await service.findVariantById('prod-1', 'var-1');
      expect(result.id).toBe('var-1');
    });

    it('should throw CodedNotFoundException if variant not found', async () => {
      mockEntityManager.findOne.mockResolvedValueOnce(null);

      await expect(service.findVariantById('prod-1', 'non-existent')).rejects.toThrow(
        CodedNotFoundException,
      );
    });
  });

  describe('updateVariant', () => {
    it('should update a variant successfully', async () => {
      const existing = { id: 'var-1', productId: 'prod-1', sku: 'SKU-OLD', isDefault: false };
      mockEntityManager.findOne.mockResolvedValueOnce(existing);

      const result = await service.updateVariant('prod-1', 'var-1', { priceCents: 2000 });
      expect(mockEntityManager.save).toHaveBeenCalled();
    });

    it('should throw CodedNotFoundException if variant not found', async () => {
      mockEntityManager.findOne.mockResolvedValueOnce(null);

      await expect(
        service.updateVariant('prod-1', 'non-existent', { priceCents: 2000 }),
      ).rejects.toThrow(CodedNotFoundException);
    });

    it('should throw CodedConflictException if updating to existing SKU', async () => {
      const existing = { id: 'var-1', productId: 'prod-1', sku: 'SKU-OLD' };
      mockEntityManager.findOne
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce({ id: 'var-2', sku: 'SKU-TAKEN' });

      await expect(
        service.updateVariant('prod-1', 'var-1', { sku: 'SKU-TAKEN' }),
      ).rejects.toThrow(CodedConflictException);
    });

    it('should throw CodedBadRequestException when unsetting default on sole variant', async () => {
      const existing = { id: 'var-1', productId: 'prod-1', sku: 'SKU-1', isDefault: true };
      mockEntityManager.findOne.mockResolvedValueOnce(existing);
      mockEntityManager.count.mockResolvedValueOnce(1);

      await expect(
        service.updateVariant('prod-1', 'var-1', { isDefault: false }),
      ).rejects.toThrow(CodedBadRequestException);
    });
  });

  describe('deleteVariant', () => {
    it('should delete variant and promote remaining if deleted variant was default', async () => {
      const variants = [
        { id: 'var-1', productId: 'prod-1', isDefault: true, createdAt: new Date('2026-01-01') },
        { id: 'var-2', productId: 'prod-1', isDefault: false, createdAt: new Date('2026-01-02') },
      ];
      mockEntityManager.find.mockResolvedValueOnce(variants);

      await service.deleteVariant('prod-1', 'var-1');

      expect(mockEntityManager.delete).toHaveBeenCalledWith(ProductVariant, {
        id: 'var-1',
        productId: 'prod-1',
      });
      expect(mockEntityManager.update).toHaveBeenCalledWith(
        ProductVariant,
        { id: 'var-2' },
        { isDefault: true },
      );
    });

    it('should throw CodedNotFoundException if variant not found', async () => {
      mockEntityManager.find.mockResolvedValueOnce([]);

      await expect(service.deleteVariant('prod-1', 'non-existent')).rejects.toThrow(
        CodedNotFoundException,
      );
    });

    it('should throw CodedBadRequestException when deleting the only variant', async () => {
      const variants = [{ id: 'var-1', productId: 'prod-1', isDefault: true }];
      mockEntityManager.find.mockResolvedValueOnce(variants);

      await expect(service.deleteVariant('prod-1', 'var-1')).rejects.toThrow(
        CodedBadRequestException,
      );
    });
  });
});
