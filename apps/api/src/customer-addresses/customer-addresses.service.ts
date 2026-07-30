import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { TenantDbService } from '../db/tenant-db.service';
import { CustomerAddress } from '../db/entities/customer-addresses.entity';
import { Country } from '../db/entities/countries.entity';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { CodedNotFoundException } from '../common/errors/coded-exceptions';
import { ErrorCode } from '@tiny-threads/shared';

interface DefaultFlags {
  defaultShipping?: boolean;
  defaultBilling?: boolean;
}

@Injectable()
export class CustomerAddressesService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly cls: ClsService,
  ) {}

  async getAddresses(customerId: string): Promise<CustomerAddress[]> {
    return this.tenantDb.run(async (em) => {
      return em.find(CustomerAddress, {
        where: { customerId },
        order: { createdAt: 'DESC' },
      });
    });
  }

  async getAddressById(
    customerId: string,
    addressId: string,
  ): Promise<CustomerAddress> {
    return this.tenantDb.run((em) =>
      this.loadAddress(em, customerId, addressId),
    );
  }

  async createAddress(
    customerId: string,
    dto: CreateAddressDto,
  ): Promise<CustomerAddress> {
    return this.tenantDb.run(async (em) => {
      const country = await em.findOne(Country, {
        where: { code: dto.countryCode },
      });
      if (!country) {
        throw new CodedNotFoundException(
          ErrorCode.INVALID_COUNTRY_CODE,
          'Invalid country code',
        );
      }

      if (dto.isDefaultShipping) {
        await em.update(
          CustomerAddress,
          { customerId },
          { isDefaultShipping: false },
        );
      }
      if (dto.isDefaultBilling) {
        await em.update(
          CustomerAddress,
          { customerId },
          { isDefaultBilling: false },
        );
      }

      const address = em.create(CustomerAddress, {
        tenantId: this.cls.get<string>('tenantId'),
        customerId,
        ...dto,
      });

      return em.save(CustomerAddress, address);
    });
  }

  async updateAddress(
    customerId: string,
    addressId: string,
    dto: UpdateAddressDto,
  ): Promise<CustomerAddress> {
    return this.tenantDb.run(async (em) => {
      const address = await this.loadAddress(em, customerId, addressId);

      if (dto.countryCode) {
        const country = await em.findOne(Country, {
          where: { code: dto.countryCode },
        });
        if (!country) {
          throw new CodedNotFoundException(
            ErrorCode.INVALID_COUNTRY_CODE,
            'Invalid country code',
          );
        }
      }

      if (dto.isDefaultShipping) {
        await em.update(
          CustomerAddress,
          { customerId },
          { isDefaultShipping: false },
        );
      }
      if (dto.isDefaultBilling) {
        await em.update(
          CustomerAddress,
          { customerId },
          { isDefaultBilling: false },
        );
      }

      Object.assign(address, dto);
      return em.save(CustomerAddress, address);
    });
  }

  async deleteAddress(customerId: string, addressId: string): Promise<void> {
    await this.tenantDb.run(async (em) => {
      const address = await this.loadAddress(em, customerId, addressId);
      await em.remove(CustomerAddress, address);
    });
  }

  async setDefaultFlags(
    customerId: string,
    addressId: string,
    flags: DefaultFlags,
  ): Promise<CustomerAddress> {
    return this.tenantDb.run(async (em) => {
      const address = await this.loadAddress(em, customerId, addressId);

      if (flags.defaultShipping) {
        await em.update(
          CustomerAddress,
          { customerId },
          { isDefaultShipping: false },
        );
        address.isDefaultShipping = true;
      }
      if (flags.defaultBilling) {
        await em.update(
          CustomerAddress,
          { customerId },
          { isDefaultBilling: false },
        );
        address.isDefaultBilling = true;
      }

      return em.save(CustomerAddress, address);
    });
  }

  // Shared by getAddressById, updateAddress, deleteAddress, and
  // setDefaultFlags — all need "load this customer's address or throw
  // ADDRESS_NOT_FOUND" but must run inside their own single tenantDb.run
  // transaction, so this takes `em` directly rather than calling the public
  // getAddressById (which would nest transactions).
  private async loadAddress(
    em: EntityManager,
    customerId: string,
    addressId: string,
  ): Promise<CustomerAddress> {
    const address = await em.findOne(CustomerAddress, {
      where: { id: addressId, customerId },
    });
    if (!address) {
      throw new CodedNotFoundException(
        ErrorCode.ADDRESS_NOT_FOUND,
        'Address not found',
      );
    }
    return address;
  }
}
