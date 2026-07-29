import { config } from 'dotenv';
import { resolve } from 'path';
import * as entities from './entities';
import { NodeEnv, validate } from '../config/env.validation';

config({ path: resolve(__dirname, '../../../../.env') });

import { DataSource, DataSourceOptions } from 'typeorm';

const env = validate(process.env);

// CLI-only DataSource: connects as app_owner (table owner, runs DDL). Never
// imported by the running app — DatabaseModule builds its own DataSource via
// TypeOrmModule.forRootAsync, connected as app_runtime.
export const typeOrmConfig: DataSourceOptions = {
  type: 'postgres',
  url: env.DATABASE_URL_MIGRATIONS,
  entities: Object.values(entities),
  migrations: [process.cwd() + '/src/db/migrations/*.ts'],
  migrationsTableName: 'migrations',
  synchronize: false,
  migrationsRun: false,
  ssl: env.NODE_ENV === NodeEnv.Production,
  logging: env.NODE_ENV === NodeEnv.Development,
};

export default new DataSource({
  ...typeOrmConfig,
  entities: [process.cwd() + '/src/db/entities/*.entity.ts'],
});
