import { config } from 'dotenv';
import { resolve } from 'path';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { uuidv7 } from 'uuidv7';

// Load environment variables (.env or .env.test)
const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
config({ path: resolve(__dirname, '../', envFile) });

import dataSource from '../src/db/data-source';
import { Tenant, TenantSettings } from '../src/db/entities';

// Helper to parse CLI flags like --name="Store Name" or --name Store Name
function parseArgs(args: string[]): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const keyVal = arg.slice(2).split('=');
      const key = keyVal[0];
      if (keyVal.length > 1) {
        result[key] = keyVal.slice(1).join('=');
      } else if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        result[key] = args[i + 1];
        i++;
      } else {
        result[key] = true;
      }
    }
  }
  return result;
}

async function run(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));

  let name = typeof parsed['name'] === 'string' ? parsed['name'] : '';
  let host = typeof parsed['host'] === 'string' ? parsed['host'] : '';
  let currency =
    typeof parsed['currency'] === 'string' ? parsed['currency'] : 'USD';

  // If interactive mode is needed for missing parameters
  if (!name || !host) {
    console.log('\n--- Create New Tenant (Interactive) ---\n');
    const rl = readline.createInterface({ input, output });

    try {
      if (!name) {
        while (!name) {
          const answer = await rl.question(
            'Enter Tenant Name (e.g. Acme Clothing): ',
          );
          name = answer.trim();
          if (!name) {
            console.log('⚠️ Tenant name cannot be empty.');
          }
        }
      }

      if (!host) {
        while (!host) {
          const answer = await rl.question(
            'Enter Tenant Host (e.g. acme.localhost): ',
          );
          host = answer
            .trim()
            .toLowerCase()
            .replace(/^https?:\/\//, '');
          if (!host) {
            console.log('⚠️ Tenant host cannot be empty.');
          }
        }
      }

      const currencyAnswer = await rl.question(
        `Enter Default Currency Code [${currency}]: `,
      );
      if (currencyAnswer.trim()) {
        currency = currencyAnswer.trim().toUpperCase();
      }
    } finally {
      rl.close();
    }
  }

  // Normalize host
  host = host
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '');
  name = name.trim();
  currency = currency.toUpperCase().trim();

  console.log('\nInitializing database connection...');
  await dataSource.initialize();

  try {
    const tenantRepo = dataSource.getRepository(Tenant);
    const existingTenant = await tenantRepo.findOne({ where: { host } });

    if (existingTenant) {
      console.error(
        `\n❌ Error: A tenant with host "${host}" already exists (ID: ${existingTenant.id}).`,
      );
      process.exit(1);
    }

    const { tenant, settings } = await dataSource.transaction(
      async (manager) => {
        const tenant = manager.create(Tenant, {
          id: uuidv7(),
          name,
          host,
        });
        await manager.save(Tenant, tenant);

        // Set RLS context for creating tenant-scoped settings
        await manager.query(
          `select set_config('app.current_tenant', $1, true)`,
          [tenant.id],
        );

        const settings = manager.create(TenantSettings, {
          id: uuidv7(),
          tenantId: tenant.id,
          allowGuestCheckout: true,
          platformFeePercent: 2.5,
          defaultCurrencyCode: currency,
          captureMode: 'immediate',
        });
        await manager.save(TenantSettings, settings);

        return { tenant, settings };
      },
    );

    console.log('\n✅ Tenant created successfully!');
    console.log('--------------------------------------------------');
    console.log(`ID:       ${tenant.id}`);
    console.log(`Name:     ${tenant.name}`);
    console.log(`Host:     ${tenant.host}`);
    console.log(`Currency: ${settings.defaultCurrencyCode}`);
    console.log('--------------------------------------------------\n');
  } catch (error) {
    const err = error as Error;
    console.error('\n❌ Failed to create tenant:', err.message || err);
    process.exit(1);
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

void run();
