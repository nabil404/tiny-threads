import { CategoriesService } from '../categories.service';
import { TenantDbService } from '../../db/tenant-db.service';
import {
  CodedBadRequestException,
  CodedNotFoundException,
} from '../../common/errors/coded-exceptions';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let tenantDbService: jest.Mocked<TenantDbService>;

  beforeEach(() => {
    tenantDbService = {
      run: jest.fn(),
    } as unknown as jest.Mocked<TenantDbService>;
    service = new CategoriesService(tenantDbService);
  });

  describe('create', () => {
    it('creates root category successfully', async () => {
      const mockCategory = { id: 'cat-1', name: 'Shirts', parentId: null };
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockReturnValue(mockCategory),
          save: jest.fn().mockResolvedValue(mockCategory),
        };
        return cb(em as any);
      });

      const result = await service.create({ name: 'Shirts' });
      expect(result).toEqual(mockCategory);
    });

    it('creates child category successfully when parent exists', async () => {
      const parentCat = { id: 'cat-1', name: 'Apparel', parentId: null };
      const childCat = { id: 'cat-2', name: 'Shirts', parentId: 'cat-1' };
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest.fn().mockResolvedValue(parentCat),
          create: jest.fn().mockReturnValue(childCat),
          save: jest.fn().mockResolvedValue(childCat),
        };
        return cb(em as any);
      });

      const result = await service.create({
        name: 'Shirts',
        parentId: 'cat-1',
      });
      expect(result).toEqual(childCat);
    });

    it('throws CodedNotFoundException if parent category does not exist', async () => {
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest.fn().mockResolvedValue(null),
        };
        return cb(em as any);
      });

      await expect(
        service.create({ name: 'Shirts', parentId: 'non-existent' }),
      ).rejects.toThrow(CodedNotFoundException);
    });
  });

  describe('getCategoryTree', () => {
    it('returns empty array when no categories exist', async () => {
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          find: jest.fn().mockResolvedValue([]),
        };
        return cb(em as any);
      });

      const result = await service.getCategoryTree();
      expect(result).toEqual([]);
    });

    it('builds category tree correctly with nested children', async () => {
      const cat1 = { id: 'cat-1', name: 'Apparel', parentId: null };
      const cat2 = { id: 'cat-2', name: 'Shirts', parentId: 'cat-1' };
      const cat3 = { id: 'cat-3', name: 'T-Shirts', parentId: 'cat-2' };
      const cat4 = { id: 'cat-4', name: 'Electronics', parentId: null };

      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          find: jest.fn().mockResolvedValue([cat1, cat2, cat3, cat4]),
        };
        return cb(em as any);
      });

      const tree = await service.getCategoryTree();
      expect(tree).toHaveLength(2);
      expect(tree[0].id).toBe('cat-1');
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children[0].id).toBe('cat-2');
      expect(tree[0].children[0].children).toHaveLength(1);
      expect(tree[0].children[0].children[0].id).toBe('cat-3');
      expect(tree[1].id).toBe('cat-4');
      expect(tree[1].children).toHaveLength(0);
    });
  });

  describe('findById', () => {
    it('returns category with children relation', async () => {
      const mockCategory = {
        id: 'cat-1',
        name: 'Shirts',
        parentId: null,
        children: [],
      };
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest.fn().mockResolvedValue(mockCategory),
        };
        return cb(em as any);
      });

      const result = await service.findById('cat-1');
      expect(result).toEqual(mockCategory);
    });

    it('throws CodedNotFoundException when category not found', async () => {
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest.fn().mockResolvedValue(null),
        };
        return cb(em as any);
      });

      await expect(service.findById('cat-999')).rejects.toThrow(
        CodedNotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates category name and parentId successfully', async () => {
      const existingCategory = {
        id: 'cat-2',
        name: 'Old Name',
        parentId: null,
      };
      const parentCategory = { id: 'cat-1', name: 'Apparel', parentId: null };
      const updatedCategory = {
        id: 'cat-2',
        name: 'New Name',
        parentId: 'cat-1',
      };

      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest.fn().mockImplementation((_entity, opts) => {
            if (opts.where.id === 'cat-2')
              return Promise.resolve(existingCategory);
            if (opts.where.id === 'cat-1')
              return Promise.resolve(parentCategory);
            return Promise.resolve(null);
          }),
          save: jest.fn().mockResolvedValue(updatedCategory),
        };
        return cb(em as any);
      });

      const result = await service.update('cat-2', {
        name: 'New Name',
        parentId: 'cat-1',
      });
      expect(result).toEqual(updatedCategory);
    });

    it('throws CodedBadRequestException if parentId equals category id on update', async () => {
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest
            .fn()
            .mockResolvedValue({ id: 'cat-1', name: 'Shirts', parentId: null }),
        };
        return cb(em as any);
      });

      await expect(
        service.update('cat-1', { parentId: 'cat-1' }),
      ).rejects.toThrow(CodedBadRequestException);
    });

    it('throws CodedBadRequestException when setting a descendant category as parent', async () => {
      const cat1 = { id: 'cat-1', name: 'Apparel', parentId: null };
      const cat2 = { id: 'cat-2', name: 'Shirts', parentId: 'cat-1' };
      const cat3 = { id: 'cat-3', name: 'T-Shirts', parentId: 'cat-2' };

      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest.fn().mockImplementation((_entity, opts) => {
            if (opts.where.id === 'cat-1') return Promise.resolve(cat1);
            if (opts.where.id === 'cat-2') return Promise.resolve(cat2);
            if (opts.where.id === 'cat-3') return Promise.resolve(cat3);
            return Promise.resolve(null);
          }),
        };
        return cb(em as any);
      });

      await expect(
        service.update('cat-1', { parentId: 'cat-3' }),
      ).rejects.toThrow(CodedBadRequestException);
    });

    it('throws CodedNotFoundException if target category does not exist', async () => {
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest.fn().mockResolvedValue(null),
        };
        return cb(em as any);
      });

      await expect(
        service.update('cat-999', { name: 'New Name' }),
      ).rejects.toThrow(CodedNotFoundException);
    });

    it('throws CodedNotFoundException if new parent category does not exist', async () => {
      const existingCategory = { id: 'cat-2', name: 'Shirts', parentId: null };
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest.fn().mockImplementation((_entity, opts) => {
            if (opts.where.id === 'cat-2')
              return Promise.resolve(existingCategory);
            return Promise.resolve(null);
          }),
        };
        return cb(em as any);
      });

      await expect(
        service.update('cat-2', { parentId: 'cat-999' }),
      ).rejects.toThrow(CodedNotFoundException);
    });
  });

  describe('delete', () => {
    it('deletes category successfully when it has no children', async () => {
      const mockCategory = {
        id: 'cat-1',
        name: 'Shirts',
        parentId: null,
        children: [],
      };
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest.fn().mockResolvedValue(mockCategory),
          remove: jest.fn().mockResolvedValue(mockCategory),
        };
        return cb(em as any);
      });

      await expect(service.delete('cat-1')).resolves.not.toThrow();
    });

    it('throws CodedNotFoundException if category does not exist', async () => {
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest.fn().mockResolvedValue(null),
        };
        return cb(em as any);
      });

      await expect(service.delete('cat-999')).rejects.toThrow(
        CodedNotFoundException,
      );
    });

    it('throws CodedBadRequestException if category has sub-categories', async () => {
      const mockCategory = {
        id: 'cat-1',
        name: 'Apparel',
        parentId: null,
        children: [{ id: 'cat-2', name: 'Shirts', parentId: 'cat-1' }],
      };
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest.fn().mockResolvedValue(mockCategory),
        };
        return cb(em as any);
      });

      await expect(service.delete('cat-1')).rejects.toThrow(
        CodedBadRequestException,
      );
    });
  });
});
