import { MerchantAdminLocaleService } from '../merchant-admin-locale.service';
import { TenantDbService } from '../../db/tenant-db.service';
import { CodedUnauthorizedException } from '../../common/errors/coded-exceptions';

describe('MerchantAdminLocaleService', () => {
  let service: MerchantAdminLocaleService;
  let tenantDbService: jest.Mocked<TenantDbService>;

  beforeEach(() => {
    tenantDbService = {
      run: jest.fn(),
    } as unknown as jest.Mocked<TenantDbService>;
    service = new MerchantAdminLocaleService(tenantDbService);
  });

  describe('updateLocale', () => {
    it('should persist a valid locale and return it', async () => {
      const user = { id: 'user-1', locale: null };
      tenantDbService.run.mockImplementation(async (cb: any) => {
        const em = {
          findOne: jest.fn().mockResolvedValue(user),
          save: jest
            .fn()
            .mockImplementation((entity) => Promise.resolve(entity)),
        };
        return await cb(em as any);
      });

      const result = await service.updateLocale('user-1', 'en');
      expect(result).toBe('en');
    });

    it('should persist a null locale to reset the preference', async () => {
      const user = { id: 'user-1', locale: 'en' };
      tenantDbService.run.mockImplementation(async (cb: any) => {
        const em = {
          findOne: jest.fn().mockResolvedValue(user),
          save: jest
            .fn()
            .mockImplementation((entity) => Promise.resolve(entity)),
        };
        return await cb(em as any);
      });

      const result = await service.updateLocale('user-1', null);
      expect(result).toBeNull();
    });

    it('should throw CodedUnauthorizedException when the merchant user no longer exists', async () => {
      tenantDbService.run.mockImplementation(async (cb: any) => {
        const em = { findOne: jest.fn().mockResolvedValue(null) };
        return await cb(em as any);
      });

      await expect(service.updateLocale('stale-user', 'en')).rejects.toThrow(
        CodedUnauthorizedException,
      );
    });
  });
});
