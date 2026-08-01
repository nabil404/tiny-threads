/* eslint-disable @typescript-eslint/unbound-method */
import { EntityManager } from 'typeorm';
import { TenantSettingsService } from '../tenant-settings.service';
import { TenantDbService } from '../../db/tenant-db.service';
import { ClsService } from 'nestjs-cls';

describe('TenantSettingsService', () => {
  let service: TenantSettingsService;
  let tenantDbService: jest.Mocked<TenantDbService>;
  let clsService: jest.Mocked<ClsService>;

  beforeEach(() => {
    tenantDbService = {
      run: jest.fn(),
    } as unknown as jest.Mocked<TenantDbService>;
    clsService = {
      get: jest.fn().mockReturnValue('tenant-123'),
    } as unknown as jest.Mocked<ClsService>;
    service = new TenantSettingsService(tenantDbService, clsService);
  });

  describe('getSettings', () => {
    it('should return existing tenant settings when found', async () => {
      const existingSettings = {
        tenantId: 'tenant-123',
        id: 'settings-1',
        allowGuestCheckout: true,
        platformFeePercent: 2.5,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      tenantDbService.run.mockImplementation(async (cb) => {
        const em = { findOne: jest.fn().mockResolvedValue(existingSettings) };
        return cb(em as any);
      });

      const result = await service.getSettings();
      expect(result).toEqual(existingSettings);
      expect(tenantDbService.run).toHaveBeenCalledTimes(1);
    });

    it('should create and return default settings when no row exists', async () => {
      let createdEntity: any;
      const savedEntity = {
        tenantId: 'tenant-123',
        id: 'settings-new',
        allowGuestCheckout: true,
        platformFeePercent: 2.5,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation((_, entity) => {
            createdEntity = entity;
            return entity;
          }),
          save: jest.fn().mockResolvedValue(savedEntity),
        };
        return cb(em as any);
      });

      const result = await service.getSettings();

      expect(createdEntity).toEqual(
        expect.objectContaining({
          tenantId: 'tenant-123',
          allowGuestCheckout: true,
          platformFeePercent: 2.5,
        }),
      );
      expect(result).toEqual(savedEntity);
      expect(tenantDbService.run).toHaveBeenCalledTimes(1);
    });

    it('should use the provided manager directly and never open a new tenantDb.run transaction (R3)', async () => {
      const existingSettings = {
        tenantId: 'tenant-123',
        id: 'settings-1',
        allowGuestCheckout: true,
        platformFeePercent: 2.5,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const em = {
        findOne: jest.fn().mockResolvedValue(existingSettings),
      } as unknown as EntityManager;

      const result = await service.getSettings(em);

      expect(result).toEqual(existingSettings);
      expect(tenantDbService.run).not.toHaveBeenCalled();
    });
  });

  describe('updateSettings', () => {
    it('should update allowGuestCheckout on existing settings and leave platformFeePercent untouched', async () => {
      const existingSettings = {
        tenantId: 'tenant-123',
        id: 'settings-1',
        allowGuestCheckout: true,
        platformFeePercent: 2.5,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest.fn().mockResolvedValue(existingSettings),
          save: jest
            .fn()
            .mockImplementation((entity) => Promise.resolve(entity)),
        };
        return cb(em as any);
      });

      const dto = {
        allowGuestCheckout: false,
      };

      const result = await service.updateSettings(dto);

      expect(result.allowGuestCheckout).toBe(false);
      expect(result.platformFeePercent).toBe(2.5);
      expect(tenantDbService.run).toHaveBeenCalledTimes(1);
    });

    it('should create default settings first if no row exists when updating', async () => {
      let createdEntity: any;

      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation((_, entity) => {
            createdEntity = { ...entity };
            return entity;
          }),
          save: jest
            .fn()
            .mockImplementation((entity) => Promise.resolve(entity)),
        };
        return cb(em as any);
      });

      const dto = {
        allowGuestCheckout: false,
      };

      const result = await service.updateSettings(dto);

      expect(createdEntity).toEqual(
        expect.objectContaining({
          tenantId: 'tenant-123',
          allowGuestCheckout: true,
          platformFeePercent: 2.5,
        }),
      );
      expect(result.allowGuestCheckout).toBe(false);
      expect(result.platformFeePercent).toBe(2.5);
    });
  });
});
