import { config } from 'dotenv';
import { resolve } from 'path';

// Loads apps/api/.env.test for every e2e spec, so the suite targets the
// separate test database instance instead of whatever the developer's .env
// points at. Referenced from test/jest-e2e.json's setupFiles.
config({ path: resolve(__dirname, '../.env.test') });
