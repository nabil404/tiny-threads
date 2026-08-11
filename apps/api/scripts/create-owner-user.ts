import { config } from 'dotenv';
import { resolve } from 'path';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import * as argon2 from 'argon2';
import { uuidv7 } from 'uuidv7';

// Load environment variables (.env or .env.test)
const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
config({ path: resolve(__dirname, '../', envFile) });

import dataSource from '../src/db/data-source';
import { Tenant, MerchantUser, MerchantUserIdentity } from '../src/db/entities';

// Helper to parse CLI flags like --email="user@example.com" or --email user@example.com
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

  const tenantId =
    typeof parsed['tenant-id'] === 'string' ? parsed['tenant-id'] : '';
  const tenantHost =
    typeof parsed['tenant-host'] === 'string' ? parsed['tenant-host'] : '';
  let email = typeof parsed['email'] === 'string' ? parsed['email'] : '';
  let password =
    typeof parsed['password'] === 'string' ? parsed['password'] : '';
  const verifiedArg = parsed['verified'];

  let isVerified = true;
  if (typeof verifiedArg === 'string') {
    isVerified = verifiedArg.toLowerCase() !== 'false';
  } else if (typeof verifiedArg === 'boolean') {
    isVerified = verifiedArg;
  }

  console.log('\nInitializing database connection...');
  await dataSource.initialize();

  try {
    const tenantRepo = dataSource.getRepository(Tenant);
    let selectedTenant: Tenant | null = null;

    // Resolve tenant if provided via flags
    if (tenantId) {
      selectedTenant = await tenantRepo.findOne({ where: { id: tenantId } });
      if (!selectedTenant) {
        console.error(`\n❌ Error: Tenant with ID "${tenantId}" not found.`);
        process.exit(1);
      }
    } else if (tenantHost) {
      const hostClean = tenantHost
        .toLowerCase()
        .trim()
        .replace(/^https?:\/\//, '');
      selectedTenant = await tenantRepo.findOne({
        where: { host: hostClean },
      });
      if (!selectedTenant) {
        console.error(
          `\n❌ Error: Tenant with host "${tenantHost}" not found.`,
        );
        process.exit(1);
      }
    }

    // Interactive prompt if arguments are missing
    if (!selectedTenant || !email || !password) {
      console.log('\n--- Create Tenant Owner User (Interactive) ---\n');
      const rl = readline.createInterface({ input, output });

      try {
        // Prompt for tenant if not selected yet
        if (!selectedTenant) {
          const tenants = await tenantRepo.find({ order: { name: 'ASC' } });
          if (tenants.length === 0) {
            console.error(
              '\n❌ Error: No tenants found in database. Create a tenant first using "pnpm create-tenant".\n',
            );
            process.exit(1);
          }

          console.log('Available Tenants:');
          tenants.forEach((t, idx) => {
            console.log(`  [${idx + 1}] ${t.name} (${t.host}) — ID: ${t.id}`);
          });

          while (!selectedTenant) {
            const answer = (
              await rl.question(
                `\nSelect tenant by number (1-${tenants.length}), host, or ID: `,
              )
            ).trim();

            const num = parseInt(answer, 10);
            if (!isNaN(num) && num >= 1 && num <= tenants.length) {
              selectedTenant = tenants[num - 1];
            } else {
              selectedTenant =
                tenants.find(
                  (t) =>
                    t.id === answer ||
                    t.host.toLowerCase() === answer.toLowerCase(),
                ) || null;
            }

            if (!selectedTenant) {
              console.log('⚠️ Invalid selection. Please try again.');
            }
          }
        }

        // Prompt for email
        if (!email) {
          while (!email) {
            const answer = (await rl.question('Enter Owner Email: ')).trim();
            if (!answer || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answer)) {
              console.log('⚠️ Please enter a valid email address.');
            } else {
              email = answer;
            }
          }
        }

        // Prompt for password
        if (!password) {
          while (!password) {
            const answer = (
              await rl.question('Enter Owner Password (min 8 characters): ')
            ).trim();
            if (answer.length < 8) {
              console.log('⚠️ Password must be at least 8 characters long.');
            } else {
              password = answer;
            }
          }
        }

        // Prompt for email verification
        if (parsed['verified'] === undefined) {
          const verifyAnswer = (
            await rl.question('Mark email as verified? (Y/n) [Y]: ')
          )
            .trim()
            .toLowerCase();
          isVerified = verifyAnswer !== 'n' && verifyAnswer !== 'no';
        }
      } finally {
        rl.close();
      }
    }

    email = email.toLowerCase().trim();
    const role = 'owner';

    if (!selectedTenant) {
      console.error('\n❌ Error: No tenant selected.');
      process.exit(1);
    }
    const tenant: Tenant = selectedTenant;

    const { merchantUser, identity } = await dataSource.transaction(
      async (manager) => {
        // Set transaction-local RLS context for tenant-scoped tables
        await manager.query(
          `select set_config('app.current_tenant', $1, true)`,
          [tenant.id],
        );

        // Check if user already exists
        const existingUser = await manager.findOne(MerchantUser, {
          where: { tenantId: tenant.id, email },
        });

        if (existingUser) {
          throw new Error(
            `Merchant user with email "${email}" already exists for tenant "${tenant.name}" (${tenant.host}).`,
          );
        }

        // Create MerchantUser entity with role hardcoded to 'owner'
        const merchantUser = manager.create(MerchantUser, {
          id: uuidv7(),
          tenantId: tenant.id,
          email,
          role,
        });
        await manager.save(MerchantUser, merchantUser);

        // Hash password with argon2id
        const passwordHash = await argon2.hash(password, {
          type: argon2.argon2id,
        });

        // Create MerchantUserIdentity entity
        const identity = manager.create(MerchantUserIdentity, {
          id: uuidv7(),
          tenantId: tenant.id,
          merchantUserId: merchantUser.id,
          provider: 'password',
          providerSubject: null,
          passwordHash,
          emailVerified: isVerified,
          verificationTokenHash: null,
          verificationTokenExpiresAt: null,
          passwordResetTokenHash: null,
          passwordResetTokenExpiresAt: null,
        });
        await manager.save(MerchantUserIdentity, identity);

        return { merchantUser, identity };
      },
    );

    console.log('\n✅ Owner User created successfully!');
    console.log('--------------------------------------------------');
    console.log(`User ID:  ${merchantUser.id}`);
    console.log(`Tenant:   ${tenant.name} (${tenant.host})`);
    console.log(`Email:    ${merchantUser.email}`);
    console.log(`Role:     ${merchantUser.role}`);
    console.log(`Verified: ${identity.emailVerified}`);
    console.log('--------------------------------------------------\n');
  } catch (error) {
    const err = error as Error;
    console.error('\n❌ Failed to create owner user:', err.message || err);
    process.exit(1);
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

void run();
