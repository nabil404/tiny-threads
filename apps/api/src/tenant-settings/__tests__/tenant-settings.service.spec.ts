/* eslint-disable @typescript-eslint/unbound-method */
import { EntityManager } from 'typeorm';
import { TenantSettingsService } from '../tenant-settings.service';
import { TenantDbService } from '../../db/tenant-db.service';
import {
  CodedBadRequestException,
  CodedNotFoundException,
} from '../../common/errors/coded-exceptions';

describe('TenantSettingsService', () => {
  let service: TenantSettingsService;
  let tenantDbService: jest.Mocked<TenantDbService>;

  beforeEach(() => {
    tenantDbService = {
      run: jest.fn(),
    } as unknown as jest.Mocked<TenantDbService>;
    service = new TenantSettingsService(tenantDbService);
  });

  describe('getSettings', () => {
    it('should return existing tenant settings when found', async () => {
      const existingSettings = {
        tenantId: 'tenant-123',
        id: 'settings-1',
        allowGuestCheckout: true,
        platformFeePercent: 2.5,
        defaultCurrencyCode: 'USD',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      tenantDbService.run.mockImplementation(async (cb: any) => {
        const em = { findOne: jest.fn().mockResolvedValue(existingSettings) };
        return await cb(em as any);
      });

      const result = await service.getSettings();
      expect(result).toEqual(existingSettings);
      expect(tenantDbService.run).toHaveBeenCalledTimes(1);
    });

    it('should throw CodedNotFoundException when no row exists', async () => {
      tenantDbService.run.mockImplementation(async (cb: any) => {
        const em = {
          findOne: jest.fn().mockResolvedValue(null),
        };
        return await cb(em as any);
      });

      await expect(service.getSettings()).rejects.toThrow(
        CodedNotFoundException,
      );
    });

    it('should use the provided manager directly and never open a new tenantDb.run transaction (R3)', async () => {
      const existingSettings = {
        tenantId: 'tenant-123',
        id: 'settings-1',
        allowGuestCheckout: true,
        platformFeePercent: 2.5,
        defaultCurrencyCode: 'USD',
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
        defaultCurrencyCode: 'USD',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      tenantDbService.run.mockImplementation(async (cb: any) => {
        const em = {
          findOne: jest.fn().mockResolvedValue(existingSettings),
          save: jest
            .fn()
            .mockImplementation((entity) => Promise.resolve(entity)),
        };
        return await cb(em as any);
      });

      const dto = {
        allowGuestCheckout: false,
      };

      const result = await service.updateSettings(dto);

      expect(result.allowGuestCheckout).toBe(false);
      expect(result.platformFeePercent).toBe(2.5);
      expect(tenantDbService.run).toHaveBeenCalledTimes(1);
    });

    it('should update defaultCurrencyCode when currency exists in database', async () => {
      const existingSettings = {
        tenantId: 'tenant-123',
        id: 'settings-1',
        allowGuestCheckout: true,
        platformFeePercent: 2.5,
        defaultCurrencyCode: 'USD',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      tenantDbService.run.mockImplementation(async (cb: any) => {
        const em = {
          findOne: jest.fn().mockImplementation((entityClass, options) => {
            if (options.where?.code === 'EUR') {
              return Promise.resolve({
                code: 'EUR',
                name: 'Euro',
                symbol: '€',
              });
            }
            return Promise.resolve(existingSettings);
          }),
          save: jest
            .fn()
            .mockImplementation((entity) => Promise.resolve(entity)),
        };
        return await cb(em as any);
      });

      const dto = {
        defaultCurrencyCode: 'EUR',
      };

      const result = await service.updateSettings(dto);

      expect(result.defaultCurrencyCode).toBe('EUR');
    });

    it('should throw CodedBadRequestException when defaultCurrencyCode is invalid', async () => {
      const existingSettings = {
        tenantId: 'tenant-123',
        id: 'settings-1',
        allowGuestCheckout: true,
        platformFeePercent: 2.5,
        defaultCurrencyCode: 'USD',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      tenantDbService.run.mockImplementation(async (cb: any) => {
        const em = {
          findOne: jest.fn().mockImplementation((entityClass, options) => {
            if (options.where?.code === 'INVALID') {
              return Promise.resolve(null);
            }
            return Promise.resolve(existingSettings);
          }),
        };
        return await cb(em as any);
      });

      const dto = {
        defaultCurrencyCode: 'INVALID',
      };

      await expect(service.updateSettings(dto)).rejects.toThrow(
        CodedBadRequestException,
      );
    });

    it('should throw CodedNotFoundException when no row exists when updating', async () => {
      tenantDbService.run.mockImplementation(async (cb: any) => {
        const em = {
          findOne: jest.fn().mockResolvedValue(null),
        };
        return await cb(em as any);
      });

      const dto = {
        allowGuestCheckout: false,
      };

      await expect(service.updateSettings(dto)).rejects.toThrow(
        CodedNotFoundException,
      );
    });
  });
});
