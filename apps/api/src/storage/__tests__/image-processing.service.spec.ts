import sharp from 'sharp';
import { ErrorCode } from '@tiny-threads/shared';
import { ImageProcessingService } from '../image-processing.service';
import { CodedBadRequestException } from '../../common/errors/coded-exceptions';

describe('ImageProcessingService', () => {
  let service: ImageProcessingService;

  beforeEach(() => {
    service = new ImageProcessingService();
  });

  describe('processAvatar', () => {
    it('processes valid PNG image into 512x512 cover WebP', async () => {
      const inputBuffer = await sharp({
        create: {
          width: 800,
          height: 600,
          channels: 4,
          background: { r: 255, g: 0, b: 0, alpha: 1 },
        },
      })
        .png()
        .toBuffer();

      const result = await service.processAvatar(inputBuffer);

      expect(result.contentType).toBe('image/webp');
      expect(result.sizeBytes).toBe(result.buffer.length);

      const metadata = await sharp(result.buffer).metadata();
      expect(metadata.format).toBe('webp');
      expect(metadata.width).toBe(512);
      expect(metadata.height).toBe(512);
    });

    it('processes valid JPEG image into WebP avatar', async () => {
      const inputBuffer = await sharp({
        create: {
          width: 400,
          height: 400,
          channels: 3,
          background: { r: 0, g: 255, b: 0 },
        },
      })
        .jpeg()
        .toBuffer();

      const result = await service.processAvatar(inputBuffer);

      expect(result.contentType).toBe('image/webp');
      const metadata = await sharp(result.buffer).metadata();
      expect(metadata.format).toBe('webp');
      expect(metadata.width).toBe(512);
      expect(metadata.height).toBe(512);
    });

    it('throws CodedBadRequestException for unsupported format (e.g. text/plain)', async () => {
      const invalidBuffer = Buffer.from('this is not an image');

      await expect(service.processAvatar(invalidBuffer)).rejects.toThrow(
        CodedBadRequestException,
      );

      try {
        await service.processAvatar(invalidBuffer);
      } catch (err: any) {
        expect(err.getResponse().code).toBe(ErrorCode.INVALID_FILE_TYPE);
      }
    });

    it('throws CodedBadRequestException for unsupported image format (e.g. GIF)', async () => {
      const gifBuffer = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 4,
          background: { r: 0, g: 0, b: 255, alpha: 1 },
        },
      })
        .gif()
        .toBuffer();

      await expect(service.processAvatar(gifBuffer)).rejects.toThrow(
        CodedBadRequestException,
      );
    });
  });

  describe('processVariantImage', () => {
    it('processes valid WebP image into max 2048x2048 inside WebP', async () => {
      const inputBuffer = await sharp({
        create: {
          width: 3000,
          height: 1500,
          channels: 4,
          background: { r: 128, g: 128, b: 128, alpha: 1 },
        },
      })
        .webp()
        .toBuffer();

      const result = await service.processVariantImage(inputBuffer);

      expect(result.contentType).toBe('image/webp');
      expect(result.sizeBytes).toBe(result.buffer.length);

      const metadata = await sharp(result.buffer).metadata();
      expect(metadata.format).toBe('webp');
      expect(metadata.width).toBe(2048);
      expect(metadata.height).toBe(1024);
    });

    it('does not enlarge smaller images for variant image', async () => {
      const inputBuffer = await sharp({
        create: {
          width: 800,
          height: 600,
          channels: 4,
          background: { r: 100, g: 100, b: 100, alpha: 1 },
        },
      })
        .png()
        .toBuffer();

      const result = await service.processVariantImage(inputBuffer);

      const metadata = await sharp(result.buffer).metadata();
      expect(metadata.format).toBe('webp');
      expect(metadata.width).toBe(800);
      expect(metadata.height).toBe(600);
    });

    it('throws CodedBadRequestException for invalid buffer', async () => {
      const invalidBuffer = Buffer.from('corrupted buffer data');

      await expect(service.processVariantImage(invalidBuffer)).rejects.toThrow(
        CodedBadRequestException,
      );
    });
  });
});
