import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ErrorCode } from '@tiny-threads/shared';
import { TenantDbService } from '../db/tenant-db.service';
import { MerchantUser } from '../db/entities/merchant-users.entity';
import { CodedUnauthorizedException } from '../common/errors/coded-exceptions';

@Injectable()
export class MerchantAdminLocaleService {
  constructor(private readonly tenantDb: TenantDbService) {}

  async updateLocale(
    merchantUserId: string,
    locale: string | null,
  ): Promise<string | null> {
    return this.tenantDb.run(async (em) => {
      const user = await this.findUserOrThrow(em, merchantUserId);
      user.locale = locale;
      const saved = await em.save(user);
      return saved.locale;
    });
  }

  private async findUserOrThrow(
    em: EntityManager,
    merchantUserId: string,
  ): Promise<MerchantUser> {
    const user = await em.findOne(MerchantUser, {
      where: { id: merchantUserId },
    });
    if (!user) {
      throw new CodedUnauthorizedException(
        ErrorCode.MERCHANT_ADMIN_NO_LONGER_EXISTS,
        'Merchant user no longer exists',
      );
    }
    return user;
  }
}
