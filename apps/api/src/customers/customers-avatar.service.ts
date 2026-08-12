import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { ErrorCode } from '@tiny-threads/shared';
import {
  CodedBadRequestException,
  CodedUnauthorizedException,
} from '../common/errors/coded-exceptions';
import { TenantDbService } from '../db/tenant-db.service';
import { Customer } from '../db/entities';
import { STORAGE_PORT } from '../storage/storage.port';
import type { StoragePort } from '../storage/storage.port';
import { ImageProcessingService } from '../storage/image-processing.service';

const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;

@Injectable()
export class CustomersAvatarService {
  constructor(
    private readonly tenantDb: TenantDbService,
    @Inject(STORAGE_PORT)
    private readonly storagePort: StoragePort,
    private readonly imageProcessingService: ImageProcessingService,
    private readonly cls: ClsService,
  ) {}

  async uploadAvatar(
    customerId: string,
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

    const key = `tenants/${tenantId}/avatars/customers/${customerId}.webp`;
    const { url } = await this.storagePort.upload({
      key,
      buffer: processed.buffer,
      contentType: processed.contentType,
      tenantId,
    });

    await this.tenantDb.run(async (manager) => {
      const customer = await manager.findOne(Customer, {
        where: { id: customerId },
      });
      if (!customer) {
        throw new CodedUnauthorizedException(
          ErrorCode.CUSTOMER_NO_LONGER_EXISTS,
          'Customer no longer exists',
        );
      }
      customer.avatarUrl = url;
      await manager.save(Customer, customer);
    });

    return { avatarUrl: url };
  }

  async deleteAvatar(customerId: string): Promise<void> {
    const tenantId = this.cls.get<string>('tenantId');

    await this.tenantDb.run(async (manager) => {
      const customer = await manager.findOne(Customer, {
        where: { id: customerId },
      });
      if (!customer) {
        throw new CodedUnauthorizedException(
          ErrorCode.CUSTOMER_NO_LONGER_EXISTS,
          'Customer no longer exists',
        );
      }

      if (customer.avatarUrl) {
        const key = `tenants/${tenantId}/avatars/customers/${customerId}.webp`;
        await this.storagePort.delete(key);
        customer.avatarUrl = null;
        await manager.save(Customer, customer);
      }
    });
  }
}
