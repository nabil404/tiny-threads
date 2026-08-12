import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { storageConfig } from '../../config/storage.config';
import { StoragePort, UploadFileOptions } from '../storage.port';

export interface LocalStorageAdapterOptions {
  localRoot: string;
  publicUrlBase: string;
}

@Injectable()
export class LocalStorageAdapter implements StoragePort {
  private readonly localRoot: string;
  private readonly publicUrlBase: string;

  constructor(
    @Inject(storageConfig.KEY)
    optionsOrConfig:
      LocalStorageAdapterOptions | ConfigType<typeof storageConfig>,
  ) {
    this.localRoot = optionsOrConfig.localRoot;
    this.publicUrlBase = optionsOrConfig.publicUrlBase;
  }

  async upload(
    options: UploadFileOptions,
  ): Promise<{ key: string; url: string }> {
    const filePath = path.join(this.localRoot, options.key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, options.buffer);
    return {
      key: options.key,
      url: this.getUrl(options.key),
    };
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.localRoot, key);
    try {
      await fs.unlink(filePath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }

  getUrl(key: string): string {
    const base = this.publicUrlBase.replace(/\/+$/, '');
    const cleanKey = key.replace(/^\/+/, '');
    return `${base}/${cleanKey}`;
  }
}
