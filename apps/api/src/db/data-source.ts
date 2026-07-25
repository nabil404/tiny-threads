import { config } from 'dotenv';
import { resolve } from 'path';
import * as entities from './entities';

config({ path: resolve(__dirname, '../../../../.env') });

import { DataSource, DataSourceOptions } from 'typeorm';

if (!process.env.DATABASE_URL_MIGRATIONS) {
  throw new Error('DATABASE_URL_MIGRATIONS is not set');
}

// CLI-only DataSource: connects as app_owner (table owner, runs DDL). Never
// imported by the running app — DatabaseModule builds its own DataSource via
// TypeOrmModule.forRootAsync, connected as app_runtime.
export const typeOrmConfig: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL_MIGRATIONS,
  entities: Object.values(entities),
  migrations: [process.cwd() + '/src/db/migrations/*.ts'],
  migrationsTableName: 'migrations',
  synchronize: false,
  migrationsRun: false,
  ssl: process.env.NODE_ENV === 'production',
  logging: process.env.NODE_ENV === 'development',
};

export default new DataSource({
  ...typeOrmConfig,
  entities: [process.cwd() + '/src/db/entities/*.entity.ts'],
});
