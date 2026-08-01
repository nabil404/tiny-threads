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
        // Relies solely on CLS (no tenantId fallback param) — safe for
        // every current caller since TenantResolutionMiddleware always
        // populates it before a request reaches a service. A future
        // background job calling this outside request context would need
        // to seed CLS itself, or this creates a row with tenantId: undefined
        // and fails the NOT NULL constraint.
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

      return em.save(settings);
    });
  }
}
