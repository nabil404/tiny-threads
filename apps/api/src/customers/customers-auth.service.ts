import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { ClsService } from 'nestjs-cls';
import { IsNull } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { ErrorCode } from '@tiny-threads/shared';
import {
  CodedConflictException,
  CodedNotFoundException,
  CodedUnauthorizedException,
} from '../common/errors/coded-exceptions';
import {
  Customer,
  CustomerIdentity,
  CustomerRefreshToken,
} from '../db/entities';
import { TenantDbService } from '../db/tenant-db.service';
import { HashingService } from '../auth-core/services/hashing.service';
import { NOTIFICATIONS_PORT } from '../notifications/notifications-port';
import type { NotificationsPort } from '../notifications/notifications-port';
import { TokenService } from '../auth-core/services/token.service';
import {
  generateOpaqueRefreshToken,
  generateOpaqueToken,
  hashRefreshToken,
} from '../common/utils/refresh-token-crypto';
import { AUTH_TOKEN_TTL_MS } from '../common/constants';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import { VerifyCustomerEmailDto } from './dto/verify-customer-email.dto';

// A well-formed but unroutable UUID used as a guaranteed-non-matching lookup
// key in requestPasswordReset()'s "account doesn't exist" branch — see the
// comment there for why this needs to stay a real DB round trip rather than
// a short-circuited no-op.
const NON_EXISTENT_ID = '00000000-0000-0000-0000-000000000000';

interface GoogleProfile {
  tenantId: string;
  googleSub: string;
  email: string;
  emailVerified: boolean;
}

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
    private readonly cls: ClsService,
  ) {}

  async register(dto: RegisterCustomerDto): Promise<{ customerId: string }> {
    // tenant_id is a NOT NULL composite-PK column on both Customer and
    // CustomerIdentity, enforced by an RLS WITH CHECK policy — nothing
    // populates it automatically on insert, so it must be read from CLS
    // (set by TenantResolutionMiddleware) and stamped explicitly.
    const tenantId = this.cls.get<string>('tenantId');

    const { customerId, verificationToken } = await this.tenantDb.run(
      async (manager) => {
        const existing = await manager.findOne(Customer, {
          where: { email: dto.email },
        });
        if (existing) {
          throw new CodedConflictException(
            ErrorCode.CUSTOMER_EMAIL_ALREADY_REGISTERED,
            'Email already registered',
          );
        }

        // Must go through manager.create() + save(), not save(Entity, plainLiteral) —
        // @BeforeInsert() id generation is a prototype method and is skipped
        // for plain objects (see base/immutable-tenant-entity-base.ts).
        const customer = await manager.save(
          manager.create(Customer, {
            tenantId,
            email: dto.email,
            name: dto.name,
          }),
        );

        const passwordHash = await this.hashing.hash(dto.password);
        const verificationToken = generateOpaqueToken();
        const verificationTokenHash = createHash('sha256')
          .update(verificationToken)
          .digest('hex');

        await manager.save(
          manager.create(CustomerIdentity, {
            tenantId,
            customerId: customer.id,
            provider: 'password',
            providerSubject: null,
            passwordHash,
            emailVerified: false,
            verificationTokenHash,
            verificationTokenExpiresAt: new Date(
              Date.now() + AUTH_TOKEN_TTL_MS.EMAIL_VERIFICATION,
            ),
          }),
        );

        return { customerId: customer.id, verificationToken };
      },
    );

    // Sent after the transaction commits, not from inside tenantDb.run() —
    // a slow/failing notification provider must not roll back a successful
    // registration.
    await this.notifications.sendEmail(dto.email, 'verification-email', {
      token: verificationToken,
    });

    return { customerId };
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
        throw new CodedNotFoundException(
          ErrorCode.CUSTOMER_VERIFICATION_TOKEN_INVALID,
          'Invalid or expired verification token',
        );
      }

      identity.emailVerified = true;
      identity.verificationTokenHash = null;
      identity.verificationTokenExpiresAt = null;
      await manager.save(CustomerIdentity, identity);
    });
  }

  async login(
    tenantId: string,
    email: string,
    password: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    return this.tenantDb.run(async (manager) => {
      // A single query joined on the customer relation rather than a
      // separate Customer lookup + CustomerIdentity lookup — RLS already
      // scopes this to the current tenant (see register()/verifyEmail()
      // above), and the password identity carries customerId directly, so
      // there's no need to round-trip through Customer first.
      const identity = await manager.findOne(CustomerIdentity, {
        where: { provider: 'password', customer: { email } },
      });

      if (
        !identity ||
        !identity.passwordHash ||
        !(await this.hashing.verify(identity.passwordHash, password))
      ) {
        throw new CodedUnauthorizedException(
          ErrorCode.AUTH_INVALID_CREDENTIALS,
          'Invalid email or password',
        );
      }

      return this.issueTokenPair(
        manager,
        tenantId,
        identity.customerId,
        randomUUID(),
      );
    });
  }

  async refresh(
    tenantId: string,
    rawRefreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = hashRefreshToken(rawRefreshToken);

    return this.tenantDb.run(async (manager) => {
      const existing = await manager.findOne(CustomerRefreshToken, {
        where: { tokenHash },
      });
      if (!existing) {
        throw new CodedUnauthorizedException(
          ErrorCode.AUTH_INVALID_REFRESH_TOKEN,
          'Invalid refresh token',
        );
      }
      if (existing.revokedAt) {
        // Reuse of a revoked token in this family is a theft signal: revoke
        // the whole family.
        await manager.update(
          CustomerRefreshToken,
          { familyId: existing.familyId },
          { revokedAt: new Date() },
        );
        throw new CodedUnauthorizedException(
          ErrorCode.AUTH_REFRESH_TOKEN_REUSE_DETECTED,
          'Refresh token reuse detected',
        );
      }
      if (existing.expiresAt < new Date()) {
        throw new CodedUnauthorizedException(
          ErrorCode.AUTH_REFRESH_TOKEN_EXPIRED,
          'Refresh token expired',
        );
      }

      // Conditional, atomic revoke: `WHERE id = $1 AND revoked_at IS NULL`
      // in one round-trip via TypeORM's IsNull() operator. Under READ
      // COMMITTED, two concurrent refresh() calls presenting the same raw
      // token can both pass the revokedAt/expiresAt checks above before
      // either commits — without this guard, both would revoke the row and
      // mint a successor token, producing two valid children from one
      // single-use rotation. Only one UPDATE can match `revoked_at IS
      // NULL`; the other sees affected === 0 and must be treated as reuse.
      const revokeResult = await manager.update(
        CustomerRefreshToken,
        { id: existing.id, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      if (!revokeResult.affected) {
        await manager.update(
          CustomerRefreshToken,
          { familyId: existing.familyId },
          { revokedAt: new Date() },
        );
        throw new CodedUnauthorizedException(
          ErrorCode.AUTH_REFRESH_TOKEN_REUSE_DETECTED,
          'Refresh token reuse detected',
        );
      }

      return this.issueTokenPair(
        manager,
        tenantId,
        existing.customerId,
        existing.familyId,
      );
    });
  }

  async logout(tenantId: string, rawRefreshToken: string): Promise<void> {
    const tokenHash = hashRefreshToken(rawRefreshToken);
    await this.tenantDb.run(async (manager) => {
      const existing = await manager.findOne(CustomerRefreshToken, {
        where: { tokenHash },
      });
      if (existing && !existing.revokedAt) {
        await manager.update(
          CustomerRefreshToken,
          { familyId: existing.familyId },
          { revokedAt: new Date() },
        );
      }
    });
  }

  async findOrCreateFromGoogle(
    profile: GoogleProfile,
  ): Promise<
    { accessToken: string; refreshToken: string } | { linkRequired: true }
  > {
    return this.tenantDb.run(async (manager) => {
      const existingGoogleIdentity = await manager.findOne(CustomerIdentity, {
        where: { provider: 'google', providerSubject: profile.googleSub },
      });
      if (existingGoogleIdentity) {
        return this.issueTokenPair(
          manager,
          profile.tenantId,
          existingGoogleIdentity.customerId,
          randomUUID(),
        );
      }

      const existingCustomer = await manager.findOne(Customer, {
        where: { email: profile.email },
      });
      if (existingCustomer) {
        // Attaching a brand-new Google identity to a PRE-EXISTING customer
        // account is gated on Google's email_verified claim — structurally,
        // regardless of which identity types that account already has (not
        // just when a password identity happens to be present). Otherwise
        // require an authenticated, deliberate link instead (see
        // linkGoogleIdentity).
        if (!profile.emailVerified) {
          return { linkRequired: true };
        }
        // Google vouching for the email is necessary but NOT sufficient: it
        // says nothing about whether the LOCAL password account on this email
        // was ever proven. register() completes without email verification, so
        // an attacker can pre-register victim@gmail.com with a password of
        // their choosing; auto-linking the victim's real Google identity onto
        // that unverified row would leave both parties sharing one account
        // (pre-account-hijacking). If our own verifyEmail() flow never
        // confirmed that password identity, force the deliberate path:
        // authenticate with the password first, then link explicitly.
        //
        // A customer with no password identity at all has no local credential
        // to hijack, so that case still auto-links on Google's claim alone —
        // requiring a verified password identity to EXIST would lock out
        // accounts that only ever had an OAuth identity.
        const existingPasswordIdentity = await manager.findOne(
          CustomerIdentity,
          {
            where: { customerId: existingCustomer.id, provider: 'password' },
          },
        );
        if (
          existingPasswordIdentity &&
          !existingPasswordIdentity.emailVerified
        ) {
          return { linkRequired: true };
        }
        await manager.save(
          manager.create(CustomerIdentity, {
            tenantId: profile.tenantId,
            customerId: existingCustomer.id,
            provider: 'google',
            providerSubject: profile.googleSub,
            emailVerified: true,
          }),
        );
        return this.issueTokenPair(
          manager,
          profile.tenantId,
          existingCustomer.id,
          randomUUID(),
        );
      }

      // No pre-existing account for this email — safe to create a brand-new
      // customer outright; there's no existing identity to protect, so no
      // verification gate applies here.
      //
      // tenant_id is a NOT NULL composite-PK column on both Customer and
      // CustomerIdentity, enforced by an RLS WITH CHECK policy — must be
      // stamped explicitly, same as in register() above.
      const customer = await manager.save(
        manager.create(Customer, {
          tenantId: profile.tenantId,
          email: profile.email,
          name: profile.email,
        }),
      );
      await manager.save(
        manager.create(CustomerIdentity, {
          tenantId: profile.tenantId,
          customerId: customer.id,
          provider: 'google',
          providerSubject: profile.googleSub,
          emailVerified: profile.emailVerified,
        }),
      );
      return this.issueTokenPair(
        manager,
        profile.tenantId,
        customer.id,
        randomUUID(),
      );
    });
  }

  async linkGoogleIdentity(params: {
    tenantId: string;
    customerId: string;
    googleSub: string;
    email: string;
  }): Promise<void> {
    await this.tenantDb.run(async (manager) => {
      const conflictingIdentity = await manager.findOne(CustomerIdentity, {
        where: { provider: 'google', providerSubject: params.googleSub },
      });
      if (
        conflictingIdentity &&
        conflictingIdentity.customerId !== params.customerId
      ) {
        throw new CodedConflictException(
          ErrorCode.CUSTOMER_GOOGLE_ALREADY_LINKED,
          'This Google account is already linked to a different customer',
        );
      }
      await manager.save(
        manager.create(CustomerIdentity, {
          tenantId: params.tenantId,
          customerId: params.customerId,
          provider: 'google',
          providerSubject: params.googleSub,
          // The customer is already authenticated and deliberately requested
          // the link, so Google's own email_verified claim doesn't gate this
          // path.
          emailVerified: true,
        }),
      );
    });
  }

  async requestPasswordReset(email: string): Promise<void> {
    // Token + hash are computed unconditionally, before we even know whether
    // `email` is registered, and every branch below performs the same shape
    // of DB round trips and always sends the same email. A response that's
    // identical in body but faster/cheaper on the "not registered" path
    // (fewer queries, no write, no outbound email) would still leak account
    // existence via timing/call-count even though nothing in the response
    // itself differs — see Task 15 review fix round 1.
    const resetToken = generateOpaqueToken();
    const resetTokenHash = createHash('sha256')
      .update(resetToken)
      .digest('hex');
    const resetTokenExpiresAt = new Date(
      Date.now() + AUTH_TOKEN_TTL_MS.PASSWORD_RESET,
    );

    await this.tenantDb.run(async (manager) => {
      const customer = await manager.findOne(Customer, { where: { email } });
      const identity = await manager.findOne(CustomerIdentity, {
        where: {
          customerId: customer?.id ?? NON_EXISTENT_ID,
          provider: 'password',
        },
      });

      // manager.update() against an explicit `id` predicate, not
      // manager.save() on a loaded entity: when there's no real identity to
      // update, there's nothing to load, and save()-ing a plain object would
      // attempt an INSERT that violates this table's NOT NULL columns.
      // update() against a guaranteed-non-matching id costs one comparable
      // UPDATE round-trip and reliably touches zero rows, so this branch's
      // DB cost matches the real one without writing anything.
      await manager.update(
        CustomerIdentity,
        { id: identity?.id ?? NON_EXISTENT_ID },
        {
          passwordResetTokenHash: resetTokenHash,
          passwordResetTokenExpiresAt: resetTokenExpiresAt,
        },
      );
    });

    // Sent after the transaction commits, not from inside tenantDb.run() —
    // same reasoning as register() above: a slow/failing notification
    // provider must not hold the CustomerIdentity row lock open or roll back
    // a reset token that was already persisted. Sent unconditionally
    // regardless of whether `email` matched a real account/identity, for the
    // same anti-enumeration reason as the DB work above.
    await this.notifications.sendEmail(email, 'password-reset', {
      token: resetToken,
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = createHash('sha256').update(token).digest('hex');

    await this.tenantDb.run(async (manager) => {
      const identity = await manager.findOne(CustomerIdentity, {
        where: { provider: 'password', passwordResetTokenHash: tokenHash },
      });
      if (
        !identity ||
        !identity.passwordResetTokenExpiresAt ||
        identity.passwordResetTokenExpiresAt < new Date()
      ) {
        throw new CodedNotFoundException(
          ErrorCode.CUSTOMER_PASSWORD_RESET_TOKEN_INVALID,
          'Invalid or expired password reset token',
        );
      }

      identity.passwordHash = await this.hashing.hash(newPassword);
      identity.passwordResetTokenHash = null;
      identity.passwordResetTokenExpiresAt = null;
      await manager.save(CustomerIdentity, identity);

      // MUST invalidate all refresh tokens on reset (§3).
      await manager.update(
        CustomerRefreshToken,
        { customerId: identity.customerId },
        { revokedAt: new Date() },
      );
    });
  }

  private async issueTokenPair(
    manager: EntityManager,
    tenantId: string,
    customerId: string,
    familyId: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const rawRefreshToken = generateOpaqueRefreshToken();

    // tenant_id is a NOT NULL composite-PK column on CustomerRefreshToken
    // (ImmutableTenantEntityBase), enforced by an RLS WITH CHECK policy —
    // must be stamped explicitly, same as Customer/CustomerIdentity in
    // register() above.
    await manager.save(
      manager.create(CustomerRefreshToken, {
        tenantId,
        customerId,
        tokenHash: hashRefreshToken(rawRefreshToken),
        familyId,
        expiresAt: new Date(Date.now() + AUTH_TOKEN_TTL_MS.REFRESH_TOKEN),
        revokedAt: null,
      }),
    );

    const accessToken = this.tokenService.signAccessToken({
      sub: customerId,
      aud: 'customer',
      tenantId,
    });
    return { accessToken, refreshToken: rawRefreshToken };
  }
}
