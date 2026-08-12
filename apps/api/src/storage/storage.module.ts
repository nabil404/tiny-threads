import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { storageConfig } from '../config/storage.config';
import { STORAGE_PORT } from './storage.port';
import { LocalStorageAdapter } from './adapters/local-storage.adapter';
import { S3StorageAdapter } from './adapters/s3-storage.adapter';
import { ImageProcessingService } from './image-processing.service';

@Module({
  imports: [ConfigModule.forFeature(storageConfig)],
  providers: [
    ImageProcessingService,
    {
      provide: STORAGE_PORT,
      useFactory: (config: ConfigType<typeof storageConfig>) => {
        if (config.driver === 's3') {
          return new S3StorageAdapter(config);
        }
        return new LocalStorageAdapter(config);
      },
      inject: [storageConfig.KEY],
    },
  ],
  exports: [STORAGE_PORT, ImageProcessingService],
})
export class StorageModule {}
