import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { TenantDbService } from '../db/tenant-db.service';
import { TenantSettings } from '../db/entities/tenant-settings.entity';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';

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
        const tId = this.cls.get<string>('tenantId');
        settings = em.create(TenantSettings, {
          tenantId: tId,
          allowGuestCheckout: true,
          platformFeePercent: 2.5,
        });
        settings = await em.save(settings);
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
        settings = em.create(TenantSettings, {
          tenantId,
          allowGuestCheckout: true,
          platformFeePercent: 2.5,
        });
      }

      if (dto.allowGuestCheckout !== undefined) {
        settings.allowGuestCheckout = dto.allowGuestCheckout;
      }
      if (dto.platformFeePercent !== undefined) {
        settings.platformFeePercent = dto.platformFeePercent;
      }

      return em.save(settings);
    });
  }
}
