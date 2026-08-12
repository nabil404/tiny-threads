import { MerchantAdminAvatarService } from '../merchant-admin-avatar.service';
import { TenantDbService } from '../../db/tenant-db.service';
import { ImageProcessingService } from '../../storage/image-processing.service';
import { ClsService } from 'nestjs-cls';
import { ErrorCode } from '@tiny-threads/shared';
import {
  CodedBadRequestException,
  CodedUnauthorizedException,
} from '../../common/errors/coded-exceptions';

describe('MerchantAdminAvatarService', () => {
  let service: MerchantAdminAvatarService;
  let tenantDbService: jest.Mocked<TenantDbService>;
  let storagePort: {
    upload: jest.Mock;
    delete: jest.Mock;
    getUrl: jest.Mock;
  };
  let imageProcessingService: {
    processAvatar: jest.Mock;
    processVariantImage: jest.Mock;
  };
  let clsService: jest.Mocked<ClsService>;

  beforeEach(() => {
    tenantDbService = {
      run: jest.fn(),
    } as unknown as jest.Mocked<TenantDbService>;

    storagePort = {
      upload: jest.fn(),
      delete: jest.fn(),
      getUrl: jest.fn(),
    };

    imageProcessingService = {
      processAvatar: jest.fn(),
      processVariantImage: jest.fn(),
    };

    clsService = {
      get: jest.fn().mockReturnValue('tenant-1'),
    } as unknown as jest.Mocked<ClsService>;

    service = new MerchantAdminAvatarService(
      tenantDbService,
      storagePort,
      imageProcessingService as unknown as ImageProcessingService,
      clsService,
    );
  });

  describe('uploadAvatar', () => {
    it('processes image with Sharp, uploads to storage, updates DB row, and returns avatarUrl', async () => {
      const mockFile = {
        fieldname: 'avatar',
        originalname: 'profile.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        buffer: Buffer.from('fake-image-bytes'),
        size: 1024,
      } as Express.Multer.File;

      const processedBuffer = Buffer.from('processed-webp-bytes');
      imageProcessingService.processAvatar.mockResolvedValue({
        buffer: processedBuffer,
        contentType: 'image/webp',
        sizeBytes: processedBuffer.length,
      });

      storagePort.upload.mockResolvedValue({
        key: 'tenants/tenant-1/avatars/merchant-users/user-1.webp',
        url: 'http://storage.local/tenants/tenant-1/avatars/merchant-users/user-1.webp',
      });

      const user = { id: 'user-1', avatarUrl: null };
      tenantDbService.run.mockImplementation(
        async (cb: (em: unknown) => Promise<unknown>) => {
          const em = {
            findOne: jest.fn().mockResolvedValue(user),
            save: jest
              .fn()
              .mockImplementation((entity) => Promise.resolve(entity)),
          };
          return await cb(em);
        },
      );

      const result = await service.uploadAvatar('user-1', mockFile);

      expect(imageProcessingService.processAvatar).toHaveBeenCalledWith(
        mockFile.buffer,
      );
      expect(storagePort.upload).toHaveBeenCalledWith({
        key: 'tenants/tenant-1/avatars/merchant-users/user-1.webp',
        buffer: processedBuffer,
        contentType: 'image/webp',
        tenantId: 'tenant-1',
      });
      expect(result).toEqual({
        avatarUrl:
          'http://storage.local/tenants/tenant-1/avatars/merchant-users/user-1.webp',
      });
    });

    it('throws FILE_TOO_LARGE when file exceeds 5MB limit', async () => {
      const mockFile = {
        fieldname: 'avatar',
        originalname: 'huge.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
        size: 5 * 1024 * 1024 + 1,
      } as Express.Multer.File;

      await expect(service.uploadAvatar('user-1', mockFile)).rejects.toThrow(
        CodedBadRequestException,
      );
      try {
        await service.uploadAvatar('user-1', mockFile);
      } catch (err: unknown) {
        const res = (err as CodedBadRequestException).getResponse() as {
          code: string;
        };
        expect(res.code).toBe(ErrorCode.FILE_TOO_LARGE);
      }
    });

    it('throws INVALID_FILE_TYPE when file is missing or buffer is empty', async () => {
      await expect(
        service.uploadAvatar(
          'user-1',
          undefined as unknown as Express.Multer.File,
        ),
      ).rejects.toThrow(CodedBadRequestException);

      const emptyFile = {
        buffer: Buffer.alloc(0),
        size: 0,
      } as Express.Multer.File;

      try {
        await service.uploadAvatar('user-1', emptyFile);
      } catch (err: unknown) {
        const res = (err as CodedBadRequestException).getResponse() as {
          code: string;
        };
        expect(res.code).toBe(ErrorCode.INVALID_FILE_TYPE);
      }
    });

    it('replaces existing avatar by overwriting storage key and updating DB', async () => {
      const mockFile = {
        fieldname: 'avatar',
        originalname: 'new-profile.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        buffer: Buffer.from('new-image-bytes'),
        size: 2048,
      } as Express.Multer.File;

      const processedBuffer = Buffer.from('processed-webp');
      imageProcessingService.processAvatar.mockResolvedValue({
        buffer: processedBuffer,
        contentType: 'image/webp',
        sizeBytes: processedBuffer.length,
      });

      storagePort.upload.mockResolvedValue({
        key: 'tenants/tenant-1/avatars/merchant-users/user-1.webp',
        url: 'http://storage.local/tenants/tenant-1/avatars/merchant-users/user-1.webp',
      });

      const existingUser = {
        id: 'user-1',
        avatarUrl:
          'http://storage.local/tenants/tenant-1/avatars/merchant-users/user-1.webp',
      };

      tenantDbService.run.mockImplementation(
        async (cb: (em: unknown) => Promise<unknown>) => {
          const em = {
            findOne: jest.fn().mockResolvedValue(existingUser),
            save: jest
              .fn()
              .mockImplementation((entity) => Promise.resolve(entity)),
          };
          return await cb(em);
        },
      );

      const result = await service.uploadAvatar('user-1', mockFile);
      expect(result.avatarUrl).toBe(
        'http://storage.local/tenants/tenant-1/avatars/merchant-users/user-1.webp',
      );
    });
  });

  describe('deleteAvatar', () => {
    it('deletes file from storage and sets avatarUrl to null in DB', async () => {
      const user = {
        id: 'user-1',
        avatarUrl:
          'http://storage.local/tenants/tenant-1/avatars/merchant-users/user-1.webp',
      };

      tenantDbService.run.mockImplementation(
        async (cb: (em: unknown) => Promise<unknown>) => {
          const em = {
            findOne: jest.fn().mockResolvedValue(user),
            save: jest
              .fn()
              .mockImplementation((entity) => Promise.resolve(entity)),
          };
          return await cb(em);
        },
      );

      await service.deleteAvatar('user-1');

      expect(storagePort.delete).toHaveBeenCalledWith(
        'tenants/tenant-1/avatars/merchant-users/user-1.webp',
      );
      expect(user.avatarUrl).toBeNull();
    });

    it('does not attempt storage deletion if user had no avatarUrl', async () => {
      const user = { id: 'user-1', avatarUrl: null };

      tenantDbService.run.mockImplementation(
        async (cb: (em: unknown) => Promise<unknown>) => {
          const em = {
            findOne: jest.fn().mockResolvedValue(user),
            save: jest
              .fn()
              .mockImplementation((entity) => Promise.resolve(entity)),
          };
          return await cb(em);
        },
      );

      await service.deleteAvatar('user-1');

      expect(storagePort.delete).not.toHaveBeenCalled();
      expect(user.avatarUrl).toBeNull();
    });

    it('throws CodedUnauthorizedException if merchant user is not found', async () => {
      tenantDbService.run.mockImplementation(
        async (cb: (em: unknown) => Promise<unknown>) => {
          const em = { findOne: jest.fn().mockResolvedValue(null) };
          return await cb(em);
        },
      );

      await expect(service.deleteAvatar('stale-user')).rejects.toThrow(
        CodedUnauthorizedException,
      );
    });
  });
});
