import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { ErrorCode } from '@tiny-threads/shared';
import {
  CodedBadRequestException,
  CodedUnauthorizedException,
} from '../common/errors/coded-exceptions';
import { TenantDbService } from '../db/tenant-db.service';
import { MerchantUser } from '../db/entities';
import { STORAGE_PORT } from '../storage/storage.port';
import type { StoragePort } from '../storage/storage.port';
import { ImageProcessingService } from '../storage/image-processing.service';

const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;

@Injectable()
export class MerchantAdminAvatarService {
  constructor(
    private readonly tenantDb: TenantDbService,
    @Inject(STORAGE_PORT)
    private readonly storagePort: StoragePort,
    private readonly imageProcessingService: ImageProcessingService,
    private readonly cls: ClsService,
  ) {}

  async uploadAvatar(
    merchantUserId: string,
    file?: Express.Multer.File,
  ): Promise<{ avatarUrl: string }> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new CodedBadRequestException(
        ErrorCode.INVALID_FILE_TYPE,
        'Avatar file is required',
      );
    }

    if (
      file.size > MAX_AVATAR_SIZE_BYTES ||
      file.buffer.length > MAX_AVATAR_SIZE_BYTES
    ) {
      throw new CodedBadRequestException(
        ErrorCode.FILE_TOO_LARGE,
        'File size exceeds 5MB limit',
      );
    }

    const tenantId = this.cls.get<string>('tenantId');
    const processed = await this.imageProcessingService.processAvatar(
      file.buffer,
    );

    const key = `tenants/${tenantId}/avatars/merchant-users/${merchantUserId}.webp`;
    const { url } = await this.storagePort.upload({
      key,
      buffer: processed.buffer,
      contentType: processed.contentType,
      tenantId,
    });

    await this.tenantDb.run(async (manager) => {
      const merchantUser = await manager.findOne(MerchantUser, {
        where: { id: merchantUserId },
      });
      if (!merchantUser) {
        throw new CodedUnauthorizedException(
          ErrorCode.MERCHANT_ADMIN_NO_LONGER_EXISTS,
          'Merchant user no longer exists',
        );
      }
      merchantUser.avatarUrl = url;
      await manager.save(MerchantUser, merchantUser);
    });

    return { avatarUrl: url };
  }

  async deleteAvatar(merchantUserId: string): Promise<void> {
    const tenantId = this.cls.get<string>('tenantId');

    const storageKey = await this.tenantDb.run(async (manager) => {
      const merchantUser = await manager.findOne(MerchantUser, {
        where: { id: merchantUserId },
      });
      if (!merchantUser) {
        throw new CodedUnauthorizedException(
          ErrorCode.MERCHANT_ADMIN_NO_LONGER_EXISTS,
          'Merchant user no longer exists',
        );
      }

      if (merchantUser.avatarUrl) {
        const key = `tenants/${tenantId}/avatars/merchant-users/${merchantUserId}.webp`;
        merchantUser.avatarUrl = null;
        await manager.save(MerchantUser, merchantUser);
        return key;
      }

      return null;
    });

    if (storageKey) {
      await this.storagePort.delete(storageKey);
    }
  }
}
