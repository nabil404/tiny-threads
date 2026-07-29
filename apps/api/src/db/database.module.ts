import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClsModule } from 'nestjs-cls';
import { TenantDbService } from './tenant-db.service';
import * as entities from './entities';
import { EnvironmentVariables } from '../config/env.validation';

// The app connects as app_runtime ONLY — a non-owner role subject to RLS.
// Migrations (as app_owner) run separately via the TypeORM CLI against
// data-source.ts, never through this connection.
@Global()
@Module({
  imports: [
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (
        configService: ConfigService<EnvironmentVariables, true>,
      ) => ({
        type: 'postgres' as const,
        url: configService.get('DATABASE_URL', { infer: true }),
        entities: Object.values(entities),
        synchronize: false, // never — synchronize can't express RLS and would fight migrations
        migrationsRun: false, // migrations run as app_owner via CLI, never at app boot as app_runtime
      }),
    }),
  ],
  providers: [TenantDbService],
  exports: [TypeOrmModule, TenantDbService],
})
export class DatabaseModule {}
