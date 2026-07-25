import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClsModule } from 'nestjs-cls';
import { TenantDbService } from './tenant-db.service';
import * as entities from './entities';

// The app connects as app_runtime ONLY — a non-owner role subject to RLS.
// Migrations (as app_owner) run separately via the TypeORM CLI against
// data-source.ts, never through this connection.
@Global()
@Module({
  imports: [
    ClsModule.forRoot({ global: true }),
    TypeOrmModule.forRootAsync({
      useFactory: () => {
        const url = process.env.DATABASE_URL;
        if (!url) {
          throw new Error('DATABASE_URL is not set');
        }
        return {
          type: 'postgres' as const,
          url,
          entities: Object.values(entities),
          synchronize: false, // never — synchronize can't express RLS and would fight migrations
          migrationsRun: false, // migrations run as app_owner via CLI, never at app boot as app_runtime
        };
      },
    }),
  ],
  providers: [TenantDbService],
  exports: [TypeOrmModule, TenantDbService],
})
export class DatabaseModule {}
