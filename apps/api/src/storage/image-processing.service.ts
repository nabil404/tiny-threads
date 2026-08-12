import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { ErrorCode } from '@tiny-threads/shared';
import { CodedBadRequestException } from '../common/errors/coded-exceptions';

export interface ProcessedImageResult {
  buffer: Buffer;
  contentType: string;
  sizeBytes: number;
}

const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'avif']);

@Injectable()
export class ImageProcessingService {
  private async validateAndGetMetadata(
    buffer: Buffer,
  ): Promise<sharp.Metadata> {
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new CodedBadRequestException(
        ErrorCode.INVALID_FILE_TYPE,
        'Invalid or empty file buffer',
      );
    }

    try {
      const metadata = await sharp(buffer).metadata();
      if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) {
        throw new CodedBadRequestException(
          ErrorCode.INVALID_FILE_TYPE,
          'Unsupported image file format',
        );
      }
      return metadata;
    } catch (err: unknown) {
      if (err instanceof CodedBadRequestException) {
        throw err;
      }
      throw new CodedBadRequestException(
        ErrorCode.INVALID_FILE_TYPE,
        'Invalid image binary data',
      );
    }
  }

  async processAvatar(buffer: Buffer): Promise<ProcessedImageResult> {
    await this.validateAndGetMetadata(buffer);

    const processedBuffer = await sharp(buffer)
      .resize(512, 512, { fit: 'cover' })
      .webp({ quality: 85 })
      .toBuffer();

    return {
      buffer: processedBuffer,
      contentType: 'image/webp',
      sizeBytes: processedBuffer.length,
    };
  }

  async processVariantImage(buffer: Buffer): Promise<ProcessedImageResult> {
    await this.validateAndGetMetadata(buffer);

    const processedBuffer = await sharp(buffer)
      .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();

    return {
      buffer: processedBuffer,
      contentType: 'image/webp',
      sizeBytes: processedBuffer.length,
    };
  }
}
