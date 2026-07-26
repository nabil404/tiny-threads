import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { Customer, CustomerIdentity } from '../db/entities';
import { TenantDbService } from '../db/tenant-db.service';
import { HashingService } from '../auth-core/hashing.service';
import { NOTIFICATIONS_PORT } from '../auth-core/notifications/notifications-port';
import type { NotificationsPort } from '../auth-core/notifications/notifications-port';
import { TokenService } from '../auth-core/token.service';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import { VerifyCustomerEmailDto } from './dto/verify-customer-email.dto';

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// TokenService isn't used by register()/verifyEmail() yet — it's accepted
// here (rather than added later) because Task 10 adds login/refresh/logout
// to this same class and needs it, and TokenService already exists from
// Task 4. Taking it in the constructor now avoids a breaking signature
// change to this file in a later task.
@Injectable()
export class CustomersAuthService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly hashing: HashingService,
    @Inject(NOTIFICATIONS_PORT)
    private readonly notifications: NotificationsPort,
    private readonly tokenService: TokenService,
  ) {}

  async register(dto: RegisterCustomerDto): Promise<{ customerId: string }> {
    return this.tenantDb.run(async (manager) => {
      const existing = await manager.findOne(Customer, {
        where: { email: dto.email },
      });
      if (existing) {
        throw new ConflictException('Email already registered');
      }

      // Must go through manager.create() + save(), not save(Entity, plainLiteral) —
      // @BeforeInsert() id generation is a prototype method and is skipped
      // for plain objects (see base/immutable-tenant-entity-base.ts).
      const customer = await manager.save(
        manager.create(Customer, { email: dto.email, name: dto.name }),
      );

      const passwordHash = await this.hashing.hash(dto.password);
      const verificationToken = randomBytes(32).toString('base64url');
      const verificationTokenHash = createHash('sha256')
        .update(verificationToken)
        .digest('hex');

      await manager.save(
        manager.create(CustomerIdentity, {
          customerId: customer.id,
          provider: 'password',
          providerSubject: null,
          passwordHash,
          emailVerified: false,
          verificationTokenHash,
          verificationTokenExpiresAt: new Date(
            Date.now() + VERIFICATION_TOKEN_TTL_MS,
          ),
        }),
      );

      await this.notifications.sendEmail(dto.email, 'verification-email', {
        token: verificationToken,
      });

      return { customerId: customer.id };
    });
  }

  async verifyEmail(dto: VerifyCustomerEmailDto): Promise<void> {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');

    await this.tenantDb.run(async (manager) => {
      const identity = await manager.findOne(CustomerIdentity, {
        where: { provider: 'password', verificationTokenHash: tokenHash },
      });

      if (
        !identity ||
        !identity.verificationTokenExpiresAt ||
        identity.verificationTokenExpiresAt < new Date()
      ) {
        throw new NotFoundException('Invalid or expired verification token');
      }

      identity.emailVerified = true;
      identity.verificationTokenHash = null;
      identity.verificationTokenExpiresAt = null;
      await manager.save(CustomerIdentity, identity);
    });
  }
}
