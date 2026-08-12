import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { storageConfig } from '../../config/storage.config';
import { StoragePort, UploadFileOptions } from '../storage.port';

export interface S3StorageAdapterOptions {
  bucket: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
  publicUrlBase?: string;
  client?: S3Client;
}

@Injectable()
export class S3StorageAdapter implements StoragePort {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly region: string;
  private readonly publicUrlBase?: string;

  constructor(
    @Inject(storageConfig.KEY)
    optionsOrConfig: S3StorageAdapterOptions | ConfigType<typeof storageConfig>,
  ) {
    if ('aws' in optionsOrConfig) {
      const awsConfig = optionsOrConfig.aws;
      this.bucket = awsConfig.bucket;
      this.region = awsConfig.region || 'us-east-1';
      this.publicUrlBase = optionsOrConfig.publicUrlBase;

      const credentials =
        awsConfig.accessKeyId && awsConfig.secretAccessKey
          ? {
              accessKeyId: awsConfig.accessKeyId,
              secretAccessKey: awsConfig.secretAccessKey,
            }
          : undefined;

      this.client = new S3Client({
        region: this.region,
        credentials,
        endpoint: awsConfig.endpoint,
      });
    } else {
      this.bucket = optionsOrConfig.bucket;
      this.region = optionsOrConfig.region || 'us-east-1';
      this.publicUrlBase = optionsOrConfig.publicUrlBase;

      if (optionsOrConfig.client) {
        this.client = optionsOrConfig.client;
      } else {
        const credentials =
          optionsOrConfig.accessKeyId && optionsOrConfig.secretAccessKey
            ? {
                accessKeyId: optionsOrConfig.accessKeyId,
                secretAccessKey: optionsOrConfig.secretAccessKey,
              }
            : undefined;

        this.client = new S3Client({
          region: this.region,
          credentials,
          endpoint: optionsOrConfig.endpoint,
        });
      }
    }
  }

  async upload(
    options: UploadFileOptions,
  ): Promise<{ key: string; url: string }> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: options.key,
      Body: options.buffer,
      ContentType: options.contentType,
    });

    await this.client.send(command);

    return {
      key: options.key,
      url: this.getUrl(options.key),
    };
  }

  async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.client.send(command);
  }

  getUrl(key: string): string {
    const cleanKey = key.replace(/^\/+/, '');
    if (this.publicUrlBase) {
      const base = this.publicUrlBase.replace(/\/+$/, '');
      return `${base}/${cleanKey}`;
    }
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${cleanKey}`;
  }
}
