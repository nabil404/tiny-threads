import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ErrorCode } from '@tiny-threads/shared';
import { TenantDbService } from '../db/tenant-db.service';
import { TenantSettings } from '../db/entities/tenant-settings.entity';
import { Currency } from '../db/entities/currencies.entity';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';
import {
  CodedBadRequestException,
  CodedNotFoundException,
} from '../common/errors/coded-exceptions';

@Injectable()
export class TenantSettingsService {
  constructor(private readonly tenantDb: TenantDbService) {}

  async getSettings(manager?: EntityManager): Promise<TenantSettings> {
    const work = async (em: EntityManager) => {
      const settings = await em.findOne(TenantSettings, { where: {} });
      if (!settings) {
        throw new CodedNotFoundException(
          ErrorCode.RESOURCE_NOT_FOUND,
          'Tenant settings not found',
        );
      }
      return settings;
    };

    return manager ? work(manager) : this.tenantDb.run(work);
  }

  async updateSettings(dto: UpdateTenantSettingsDto): Promise<TenantSettings> {
    return this.tenantDb.run(async (em) => {
      const settings = await em.findOne(TenantSettings, { where: {} });
      if (!settings) {
        throw new CodedNotFoundException(
          ErrorCode.RESOURCE_NOT_FOUND,
          'Tenant settings not found',
        );
      }

      if (dto.defaultCurrencyCode !== undefined) {
        const currency = await em.findOne(Currency, {
          where: { code: dto.defaultCurrencyCode },
        });
        if (!currency) {
          throw new CodedBadRequestException(
            ErrorCode.VALIDATION_FAILED,
            'Invalid currency code',
          );
        }
        settings.defaultCurrencyCode = dto.defaultCurrencyCode;
      }

      if (dto.allowGuestCheckout !== undefined) {
        settings.allowGuestCheckout = dto.allowGuestCheckout;
      }

      return em.save(settings);
    });
  }
}
