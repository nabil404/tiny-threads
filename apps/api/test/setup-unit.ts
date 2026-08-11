import { config } from 'dotenv';
import { resolve } from 'path';

// Loads apps/api/.env.test for every unit spec, so tests that hit a real
// database (e.g. tenant-db.spec.ts) target the separate test instance instead
// of whatever the developer's .env points at. Referenced from
// apps/api/package.json's jest.setupFiles.
config({ path: resolve(__dirname, '../.env.test') });
