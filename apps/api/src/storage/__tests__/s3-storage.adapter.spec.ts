import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { S3StorageAdapter } from '../adapters/s3-storage.adapter';

describe('S3StorageAdapter', () => {
  let adapter: S3StorageAdapter;
  let mockS3Client: jest.Mocked<S3Client>;

  beforeEach(() => {
    mockS3Client = {
      send: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<S3Client>;

    adapter = new S3StorageAdapter({
      bucket: 'test-bucket',
      region: 'us-east-1',
      publicUrlBase: 'https://cdn.example.com/uploads',
      client: mockS3Client,
    });
  });

  describe('upload', () => {
    it('issues PutObjectCommand with correct bucket, key, and content-type', async () => {
      const key = 'tenants/tenant-1/products/item.jpg';
      const buffer = Buffer.from('fake image content');
      const options = {
        key,
        buffer,
        contentType: 'image/jpeg',
        tenantId: 'tenant-1',
      };

      const result = await adapter.upload(options);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockS3Client.send).toHaveBeenCalledTimes(1);
      const command = mockS3Client.send.mock.calls[0][0];

      expect(command).toBeInstanceOf(PutObjectCommand);
      expect(command.input).toEqual({
        Bucket: 'test-bucket',
        Key: key,
        Body: buffer,
        ContentType: 'image/jpeg',
      });

      expect(result).toEqual({
        key,
        url: 'https://cdn.example.com/uploads/tenants/tenant-1/products/item.jpg',
      });
    });
  });

  describe('delete', () => {
    it('issues DeleteObjectCommand with correct bucket and key', async () => {
      const key = 'tenants/tenant-1/products/item.jpg';

      await adapter.delete(key);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockS3Client.send).toHaveBeenCalledTimes(1);
      const command = mockS3Client.send.mock.calls[0][0];

      expect(command).toBeInstanceOf(DeleteObjectCommand);
      expect(command.input).toEqual({
        Bucket: 'test-bucket',
        Key: key,
      });
    });
  });

  describe('getUrl', () => {
    it('returns custom publicUrlBase formatted url when configured', () => {
      const key = 'tenants/tenant-1/file.png';
      const url = adapter.getUrl(key);

      expect(url).toBe(
        'https://cdn.example.com/uploads/tenants/tenant-1/file.png',
      );
    });

    it('returns standard S3 url when publicUrlBase is not configured', () => {
      const adapterWithoutPublicUrl = new S3StorageAdapter({
        bucket: 'my-s3-bucket',
        region: 'us-west-2',
        client: mockS3Client,
      });

      const url = adapterWithoutPublicUrl.getUrl('tenants/tenant-1/file.png');

      expect(url).toBe(
        'https://my-s3-bucket.s3.us-west-2.amazonaws.com/tenants/tenant-1/file.png',
      );
    });
  });
});
