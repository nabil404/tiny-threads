import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { uuidv7 } from 'uuidv7';
import { ErrorCode } from '@tiny-threads/shared';
import { TenantDbService } from '../db/tenant-db.service';
import { TenantSettings } from '../db/entities/tenant-settings.entity';
import { Currency } from '../db/entities/currencies.entity';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';
import { CodedBadRequestException } from '../common/errors/coded-exceptions';

@Injectable()
export class TenantSettingsService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly cls: ClsService,
  ) {}

  async getSettings(manager?: EntityManager): Promise<TenantSettings> {
    const work = async (em: EntityManager) => {
      let settings = await em.findOne(TenantSettings, { where: {} });
      if (!settings) {
        const tenantId = this.cls.get<string>('tenantId');
        await em
          .createQueryBuilder()
          .insert()
          .into(TenantSettings)
          .values({
            id: uuidv7(),
            tenantId,
            allowGuestCheckout: true,
            platformFeePercent: 2.5,
            defaultCurrencyCode: 'USD',
          })
          .orIgnore()
          .execute();

        settings = await em.findOneOrFail(TenantSettings, { where: {} });
      }
      return settings;
    };

    return manager ? work(manager) : this.tenantDb.run(work);
  }

  async updateSettings(dto: UpdateTenantSettingsDto): Promise<TenantSettings> {
    return this.tenantDb.run(async (em) => {
      let settings = await em.findOne(TenantSettings, { where: {} });
      if (!settings) {
        const tenantId = this.cls.get<string>('tenantId');
        await em
          .createQueryBuilder()
          .insert()
          .into(TenantSettings)
          .values({
            id: uuidv7(),
            tenantId,
            allowGuestCheckout: true,
            platformFeePercent: 2.5,
            defaultCurrencyCode: 'USD',
          })
          .orIgnore()
          .execute();

        settings = await em.findOneOrFail(TenantSettings, { where: {} });
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
