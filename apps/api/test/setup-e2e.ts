import { config } from 'dotenv';
import { resolve } from 'path';

// Loads the repo-root .env for every e2e spec, so the suite doesn't depend on
// the developer having exported DATABASE_URL/JWT_SECRET/etc. into their shell
// first. Referenced from test/jest-e2e.json's setupFiles.
config({ path: resolve(__dirname, '../../../.env') });
