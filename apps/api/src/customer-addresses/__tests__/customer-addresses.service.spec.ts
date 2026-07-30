/* eslint-disable @typescript-eslint/unbound-method */
import { CustomerAddressesService } from '../customer-addresses.service';
import { TenantDbService } from '../../db/tenant-db.service';
import { ClsService } from 'nestjs-cls';
import { CodedNotFoundException } from '../../common/errors/coded-exceptions';

describe('CustomerAddressesService', () => {
  let service: CustomerAddressesService;
  let tenantDbService: jest.Mocked<TenantDbService>;
  let clsService: jest.Mocked<ClsService>;

  beforeEach(() => {
    tenantDbService = {
      run: jest.fn(),
    } as unknown as jest.Mocked<TenantDbService>;
    clsService = {
      get: jest.fn().mockReturnValue('tenant-123'),
    } as unknown as jest.Mocked<ClsService>;
    service = new CustomerAddressesService(tenantDbService, clsService);
  });

  const baseCreateDto = {
    firstName: 'John',
    lastName: 'Doe',
    line1: '123 Main St',
    city: 'City',
    postalCode: '12345',
    countryCode: 'US',
  };

  describe('getAddresses', () => {
    it('should return all addresses for the customer', async () => {
      const addresses = [{ id: 'addr-1', customerId: 'cust-1' }];
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = { find: jest.fn().mockResolvedValue(addresses) };
        return cb(em as any);
      });

      const result = await service.getAddresses('cust-1');
      expect(result).toEqual(addresses);
      expect(tenantDbService.run).toHaveBeenCalledTimes(1);
    });
  });

  describe('getAddressById', () => {
    it('should return the address when found', async () => {
      const address = { id: 'addr-1', customerId: 'cust-1' };
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = { findOne: jest.fn().mockResolvedValue(address) };
        return cb(em as any);
      });

      const result = await service.getAddressById('cust-1', 'addr-1');
      expect(result).toEqual(address);
      expect(tenantDbService.run).toHaveBeenCalledTimes(1);
    });

    it('should throw CodedNotFoundException when the address does not exist', async () => {
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = { findOne: jest.fn().mockResolvedValue(null) };
        return cb(em as any);
      });

      await expect(
        service.getAddressById('cust-1', 'missing-addr'),
      ).rejects.toThrow(CodedNotFoundException);
    });
  });

  describe('createAddress', () => {
    it('should throw CodedNotFoundException if countryCode does not exist', async () => {
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = { findOne: jest.fn().mockResolvedValue(null) };
        return cb(em as any);
      });

      await expect(
        service.createAddress('cust-1', {
          ...baseCreateDto,
          countryCode: 'XX',
        }),
      ).rejects.toThrow(CodedNotFoundException);
    });

    it('should stamp tenantId and customerId on the created address', async () => {
      const country = { code: 'US', name: 'United States' };
      const savedAddress = { id: 'addr-1', ...baseCreateDto };
      let created: any;
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest.fn().mockResolvedValue(country),
          update: jest.fn().mockResolvedValue(undefined),
          create: jest.fn().mockImplementation((_, entity) => {
            created = entity;
            return entity;
          }),
          save: jest.fn().mockResolvedValue(savedAddress),
        };
        return cb(em as any);
      });

      const result = await service.createAddress('cust-1', baseCreateDto);
      expect(created).toEqual(
        expect.objectContaining({
          tenantId: 'tenant-123',
          customerId: 'cust-1',
          firstName: 'John',
        }),
      );
      expect(result).toEqual(savedAddress);
      expect(tenantDbService.run).toHaveBeenCalledTimes(1);
    });

    it('should unset existing default flags when creating a new default shipping/billing address', async () => {
      const country = { code: 'US', name: 'United States' };
      const savedAddress = { id: 'addr-1', ...baseCreateDto };
      const updateCalls: any[] = [];
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest.fn().mockResolvedValue(country),
          update: jest.fn().mockImplementation((_, where, patch) => {
            updateCalls.push({ where, patch });
            return Promise.resolve(undefined);
          }),
          create: jest.fn().mockImplementation((_, entity) => entity),
          save: jest.fn().mockResolvedValue(savedAddress),
        };
        return cb(em as any);
      });

      await service.createAddress('cust-1', {
        ...baseCreateDto,
        isDefaultShipping: true,
        isDefaultBilling: true,
      });

      expect(updateCalls).toEqual(
        expect.arrayContaining([
          {
            where: { customerId: 'cust-1' },
            patch: { isDefaultShipping: false },
          },
          {
            where: { customerId: 'cust-1' },
            patch: { isDefaultBilling: false },
          },
        ]),
      );
    });
  });

  describe('updateAddress', () => {
    it('should throw CodedNotFoundException if address does not exist', async () => {
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = { findOne: jest.fn().mockResolvedValue(null) };
        return cb(em as any);
      });

      await expect(
        service.updateAddress('cust-1', 'missing-addr', { city: 'New City' }),
      ).rejects.toThrow(CodedNotFoundException);
    });

    it('should throw CodedNotFoundException if the new countryCode is invalid', async () => {
      const address = { id: 'addr-1', customerId: 'cust-1', countryCode: 'US' };
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest
            .fn()
            .mockResolvedValueOnce(address) // loadAddress
            .mockResolvedValueOnce(null), // country lookup
        };
        return cb(em as any);
      });

      await expect(
        service.updateAddress('cust-1', 'addr-1', { countryCode: 'XX' }),
      ).rejects.toThrow(CodedNotFoundException);
    });

    it('should apply the patch and save via a single transaction', async () => {
      const address = {
        id: 'addr-1',
        customerId: 'cust-1',
        city: 'Old City',
      };
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest.fn().mockResolvedValueOnce(address),
          update: jest.fn().mockResolvedValue(undefined),
          save: jest.fn().mockImplementation((_, entity) => entity),
        };
        return cb(em as any);
      });

      const result = await service.updateAddress('cust-1', 'addr-1', {
        city: 'New City',
      });
      expect(result).toEqual(
        expect.objectContaining({ id: 'addr-1', city: 'New City' }),
      );
      expect(tenantDbService.run).toHaveBeenCalledTimes(1);
    });
  });

  describe('deleteAddress', () => {
    it('should throw CodedNotFoundException if address does not exist', async () => {
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = { findOne: jest.fn().mockResolvedValue(null) };
        return cb(em as any);
      });

      await expect(
        service.deleteAddress('cust-1', 'missing-addr'),
      ).rejects.toThrow(CodedNotFoundException);
    });

    it('should remove the address via a single transaction', async () => {
      const address = { id: 'addr-1', customerId: 'cust-1' };
      let removed: any;
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest.fn().mockResolvedValue(address),
          remove: jest.fn().mockImplementation((_, entity) => {
            removed = entity;
            return Promise.resolve(entity);
          }),
        };
        return cb(em as any);
      });

      await service.deleteAddress('cust-1', 'addr-1');
      expect(removed).toEqual(address);
      expect(tenantDbService.run).toHaveBeenCalledTimes(1);
    });
  });

  describe('setDefaultFlags', () => {
    it('should throw CodedNotFoundException if address does not exist', async () => {
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = { findOne: jest.fn().mockResolvedValue(null) };
        return cb(em as any);
      });

      await expect(
        service.setDefaultFlags('cust-1', 'missing-addr', {
          defaultShipping: true,
        }),
      ).rejects.toThrow(CodedNotFoundException);
    });

    it('should unset other addresses default flags and set the flag on this address', async () => {
      const address = {
        id: 'addr-1',
        customerId: 'cust-1',
        isDefaultShipping: false,
        isDefaultBilling: false,
      };
      const updateCalls: any[] = [];
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest.fn().mockResolvedValue(address),
          update: jest.fn().mockImplementation((_, where, patch) => {
            updateCalls.push({ where, patch });
            return Promise.resolve(undefined);
          }),
          save: jest.fn().mockImplementation((_, entity) => entity),
        };
        return cb(em as any);
      });

      const result = await service.setDefaultFlags('cust-1', 'addr-1', {
        defaultShipping: true,
        defaultBilling: true,
      });

      expect(updateCalls).toEqual(
        expect.arrayContaining([
          {
            where: { customerId: 'cust-1' },
            patch: { isDefaultShipping: false },
          },
          {
            where: { customerId: 'cust-1' },
            patch: { isDefaultBilling: false },
          },
        ]),
      );
      expect(result).toEqual(
        expect.objectContaining({
          isDefaultShipping: true,
          isDefaultBilling: true,
        }),
      );
      expect(tenantDbService.run).toHaveBeenCalledTimes(1);
    });
  });

  describe('transaction structure', () => {
    it('should open exactly one tenantDb.run per public method call, never nested', async () => {
      const runCallDepths: number[] = [];
      let depth = 0;
      const address = {
        id: 'addr-1',
        customerId: 'cust-1',
        isDefaultShipping: false,
        isDefaultBilling: false,
      };
      tenantDbService.run.mockImplementation(async (cb) => {
        depth += 1;
        runCallDepths.push(depth);
        const em = {
          findOne: jest.fn().mockResolvedValue(address),
          update: jest.fn().mockResolvedValue(undefined),
          save: jest.fn().mockImplementation((_, entity) => entity),
          remove: jest.fn().mockResolvedValue(undefined),
        };
        const result = await cb(em as any);
        depth -= 1;
        return result;
      });

      await service.setDefaultFlags('cust-1', 'addr-1', {
        defaultShipping: true,
      });
      expect(Math.max(...runCallDepths)).toBe(1);
    });
  });
});
