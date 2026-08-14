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
    const existingSettings = {
      tenantId: 'tenant-123',
      id: 'settings-1',
      allowGuestCheckout: true,
      platformFeePercent: 2.5,
      defaultCurrencyCode: 'USD',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const usdCurrency = { code: 'USD', name: 'US Dollar', symbol: '$' };

    function findOneMock(settings: unknown, currency: unknown) {
      return jest.fn().mockImplementation((entityClass, options) => {
        if (options.where?.code !== undefined) {
          return Promise.resolve(currency);
        }
        return Promise.resolve(settings);
      });
    }

    it('should return existing tenant settings with the currency symbol when found', async () => {
      tenantDbService.run.mockImplementation(async (cb: any) => {
        const em = { findOne: findOneMock(existingSettings, usdCurrency) };
        return await cb(em as any);
      });

      const result = await service.getSettings();
      expect(result).toEqual({
        ...existingSettings,
        defaultCurrencySymbol: '$',
      });
      expect(tenantDbService.run).toHaveBeenCalledTimes(1);
    });

    it('should throw CodedNotFoundException when no settings row exists', async () => {
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

    it('should throw CodedNotFoundException when the currency row is missing', async () => {
      tenantDbService.run.mockImplementation(async (cb: any) => {
        const em = { findOne: findOneMock(existingSettings, null) };
        return await cb(em as any);
      });

      await expect(service.getSettings()).rejects.toThrow(
        CodedNotFoundException,
      );
    });

    it('should use the provided manager directly and never open a new tenantDb.run transaction (R3)', async () => {
      const em = {
        findOne: findOneMock(existingSettings, usdCurrency),
      } as unknown as EntityManager;

      const result = await service.getSettings(em);

      expect(result).toEqual({
        ...existingSettings,
        defaultCurrencySymbol: '$',
      });
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

    it('should update lowStockThreshold on existing settings and leave allowGuestCheckout untouched', async () => {
      const existingSettings = {
        tenantId: 'tenant-123',
        id: 'settings-1',
        allowGuestCheckout: true,
        platformFeePercent: 2.5,
        defaultCurrencyCode: 'USD',
        lowStockThreshold: 10,
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
        lowStockThreshold: 25,
      };

      const result = await service.updateSettings(dto);

      expect(result.lowStockThreshold).toBe(25);
      expect(result.allowGuestCheckout).toBe(true);
    });
  });
});
