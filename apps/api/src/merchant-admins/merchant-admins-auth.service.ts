import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { ClsService } from 'nestjs-cls';
import { IsNull } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { ErrorCode } from '@tiny-threads/shared';
import {
  CodedConflictException,
  CodedForbiddenException,
  CodedNotFoundException,
  CodedUnauthorizedException,
} from '../common/errors/coded-exceptions';
import {
  MerchantUser,
  MerchantUserIdentity,
  MerchantUserInvite,
  MerchantUserRefreshToken,
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
import { RegisterMerchantUserDto } from './dto/register-merchant-user.dto';
import { VerifyMerchantUserEmailDto } from './dto/verify-merchant-user-email.dto';
import { roleOutranks } from './utils/role-hierarchy';

// A well-formed but unroutable UUID used as a guaranteed-non-matching lookup
// key in requestPasswordReset()'s "account doesn't exist" branch — see the
// comment there for why this needs to stay a real DB round trip rather than
// a short-circuited no-op. Mirrors CustomersAuthService's NON_EXISTENT_ID.
const NON_EXISTENT_ID = '00000000-0000-0000-0000-000000000000';

interface GoogleProfile {
  tenantId: string;
  googleSub: string;
  email: string;
  emailVerified: boolean;
}

@Injectable()
export class MerchantAdminsAuthService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly hashing: HashingService,
    @Inject(NOTIFICATIONS_PORT)
    private readonly notifications: NotificationsPort,
    private readonly tokenService: TokenService,
    private readonly cls: ClsService,
  ) {}

  // Fix round 1 (security): register() is a public, unauthenticated
  // endpoint. It used to take email/role straight from the caller, which let
  // anyone who knew a tenant's subdomain register themselves as that
  // tenant's `owner` — role was entirely self-selected at signup, with zero
  // prior authorization, fully defeating RolesGuard. Registration now
  // requires a valid, unexpired, unused MerchantUserInvite (issued by an
  // existing owner/admin via inviteMember() below); email and role are
  // derived from that invite record, never from client input.
  async register(
    dto: RegisterMerchantUserDto,
  ): Promise<{ merchantUserId: string }> {
    // tenant_id is a NOT NULL composite-PK column on both MerchantUser and
    // MerchantUserIdentity, enforced by an RLS WITH CHECK policy — nothing
    // populates it automatically on insert, so it must be read from CLS
    // (set by TenantResolutionMiddleware) and stamped explicitly, same as
    // CustomersAuthService.register().
    const tenantId = this.cls.get<string>('tenantId');
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');

    const { merchantUserId, verificationToken, email } =
      await this.tenantDb.run(async (manager) => {
        const invite = await manager.findOne(MerchantUserInvite, {
          where: { tokenHash },
        });
        if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
          throw new CodedNotFoundException(
            ErrorCode.MERCHANT_ADMIN_INVITE_TOKEN_INVALID,
            'Invalid or expired invite token',
          );
        }

        // Atomically claim the invite BEFORE creating anything else —
        // `WHERE id = $1 AND used_at IS NULL` mirrors the refresh-token
        // rotation race fix in refresh() below. Two concurrent register()
        // calls presenting the same still-valid invite token could both
        // pass the usedAt/expiresAt checks above before either commits;
        // only one UPDATE can match `used_at IS NULL`. The loser sees
        // affected === 0 and must bail out here, before creating a second
        // MerchantUser for the same invite.
        const claimResult = await manager.update(
          MerchantUserInvite,
          { id: invite.id, usedAt: IsNull() },
          { usedAt: new Date() },
        );
        if (!claimResult.affected) {
          throw new CodedNotFoundException(
            ErrorCode.MERCHANT_ADMIN_INVITE_TOKEN_INVALID,
            'Invalid or expired invite token',
          );
        }

        const existing = await manager.findOne(MerchantUser, {
          where: { email: invite.email },
        });
        if (existing) {
          throw new CodedConflictException(
            ErrorCode.MERCHANT_ADMIN_EMAIL_ALREADY_REGISTERED,
            'Email already registered',
          );
        }

        const merchantUser = await manager.save(
          manager.create(MerchantUser, {
            tenantId,
            email: invite.email,
            role: invite.role,
          }),
        );

        const passwordHash = await this.hashing.hash(dto.password);
        const verificationToken = generateOpaqueToken();
        const verificationTokenHash = createHash('sha256')
          .update(verificationToken)
          .digest('hex');

        await manager.save(
          manager.create(MerchantUserIdentity, {
            tenantId,
            merchantUserId: merchantUser.id,
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

        return {
          merchantUserId: merchantUser.id,
          verificationToken,
          email: invite.email,
        };
      });

    // Sent after the transaction commits, not from inside tenantDb.run() —
    // a slow/failing notification provider must not roll back a successful
    // registration.
    await this.notifications.sendEmail(email, 'verification-email', {
      token: verificationToken,
    });

    return { merchantUserId };
  }

  // Issues a single-use, 7-day invite that lets one specific email register
  // under one specific role — the only path by which a role gets granted,
  // now that register() no longer accepts a caller-supplied role. Guarded at
  // the controller with @UseGuards(MerchantAdminJwtAuthGuard, RolesGuard) +
  // @Roles('owner', 'admin') so only existing owners/admins can invite new
  // members.
  //
  // Fix round 2 (security): RolesGuard only checks the caller holds ONE of
  // ('owner', 'admin') — it says nothing about whether the role being
  // GRANTED outranks the caller's own. Without the roleOutranks() check
  // below, any 'admin' could invite someone in as 'owner', making an admin
  // credential equivalent to an owner credential and defeating the entire
  // point of RolesGuard/separate roles. Checked first, before any DB access,
  // so a rejected request never creates a partial invite.
  //
  // NOTE (known, accepted gap): this only covers inviting *additional*
  // members to a tenant that already has at least one merchant admin. It
  // does not address how a brand-new tenant gets its very first owner —
  // that's a tenant-onboarding/bootstrapping concern with no tenant-creation
  // flow yet in this codebase, and is out of scope for this auth plan.
  async inviteMember(params: {
    tenantId: string;
    invitedByMerchantUserId: string;
    invitedByRole: string;
    email: string;
    role: string;
  }): Promise<void> {
    if (roleOutranks(params.role, params.invitedByRole)) {
      throw new CodedForbiddenException(
        ErrorCode.MERCHANT_ADMIN_ROLE_TOO_HIGH,
        `Cannot invite a member with a role higher than your own (${params.invitedByRole})`,
        { invitedByRole: params.invitedByRole },
      );
    }

    const rawToken = generateOpaqueToken();
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    await this.tenantDb.run(async (manager) => {
      await manager.save(
        manager.create(MerchantUserInvite, {
          tenantId: params.tenantId,
          email: params.email,
          role: params.role,
          tokenHash,
          expiresAt: new Date(Date.now() + AUTH_TOKEN_TTL_MS.MERCHANT_INVITE),
          usedAt: null,
          invitedByMerchantUserId: params.invitedByMerchantUserId,
        }),
      );
    });

    // The raw invite token is never returned to any caller — same
    // discipline as verification/password-reset tokens elsewhere in this
    // service. It only ever leaves the system via this notification.
    await this.notifications.sendEmail(params.email, 'merchant-invite', {
      token: rawToken,
    });
  }

  async verifyEmail(dto: VerifyMerchantUserEmailDto): Promise<void> {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');

    await this.tenantDb.run(async (manager) => {
      const identity = await manager.findOne(MerchantUserIdentity, {
        where: { provider: 'password', verificationTokenHash: tokenHash },
      });

      if (
        !identity ||
        !identity.verificationTokenExpiresAt ||
        identity.verificationTokenExpiresAt < new Date()
      ) {
        throw new CodedNotFoundException(
          ErrorCode.MERCHANT_ADMIN_VERIFICATION_TOKEN_INVALID,
          'Invalid or expired verification token',
        );
      }

      identity.emailVerified = true;
      identity.verificationTokenHash = null;
      identity.verificationTokenExpiresAt = null;
      await manager.save(MerchantUserIdentity, identity);
    });
  }

  async login(
    tenantId: string,
    email: string,
    password: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    return this.tenantDb.run(async (manager) => {
      const merchantUser = await manager.findOne(MerchantUser, {
        where: { email },
      });
      const identity = merchantUser
        ? await manager.findOne(MerchantUserIdentity, {
            where: { merchantUserId: merchantUser.id, provider: 'password' },
          })
        : null;

      if (
        !merchantUser ||
        !identity?.passwordHash ||
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
        merchantUser.id,
        merchantUser.role,
        randomUUID(),
      );
    });
  }

  // Mirrors CustomersAuthService.findOrCreateFromGoogle (Task 11), against
  // MerchantUser/MerchantUserIdentity. Unlike Customers, a merchant admin
  // account is provisioned by an existing admin (register endpoint /
  // invite flow), not self-service via OAuth — no matching account means no
  // access, so there's no "create" branch here, only "find or reject".
  async findOrCreateFromGoogle(
    profile: GoogleProfile,
  ): Promise<
    { accessToken: string; refreshToken: string } | { linkRequired: true }
  > {
    return this.tenantDb.run(async (manager) => {
      const existingGoogleIdentity = await manager.findOne(
        MerchantUserIdentity,
        {
          where: { provider: 'google', providerSubject: profile.googleSub },
        },
      );
      if (existingGoogleIdentity) {
        const owner = await manager.findOne(MerchantUser, {
          where: { id: existingGoogleIdentity.merchantUserId },
        });
        return this.issueTokenPair(
          manager,
          profile.tenantId,
          owner!.id,
          owner!.role,
          randomUUID(),
        );
      }

      const existingMerchantUser = await manager.findOne(MerchantUser, {
        where: { email: profile.email },
      });
      if (existingMerchantUser) {
        const existingPasswordIdentity = await manager.findOne(
          MerchantUserIdentity,
          {
            where: {
              merchantUserId: existingMerchantUser.id,
              provider: 'password',
            },
          },
        );
        if (existingPasswordIdentity) {
          // Google vouching for the email is necessary but NOT sufficient: it
          // says nothing about whether the LOCAL password account on this
          // email was ever proven. register() completes without email
          // verification, so an attacker holding an unredeemed invite (or an
          // account provisioned but never verified) can sit on
          // victim@example.com with a password of their choosing;
          // auto-linking the victim's real Google identity onto that
          // unverified row would leave both parties sharing one merchant
          // admin account (pre-account-hijacking). If our own verifyEmail()
          // flow never confirmed this password identity, force the deliberate
          // path: authenticate with the password first, then link.
          if (
            !profile.emailVerified ||
            !existingPasswordIdentity.emailVerified
          ) {
            return { linkRequired: true };
          }
          // tenant_id is a NOT NULL composite-PK column on
          // MerchantUserIdentity, enforced by an RLS WITH CHECK policy —
          // must be stamped explicitly, same as everywhere else in this
          // service that creates a tenant-scoped row.
          await manager.save(
            manager.create(MerchantUserIdentity, {
              tenantId: profile.tenantId,
              merchantUserId: existingMerchantUser.id,
              provider: 'google',
              providerSubject: profile.googleSub,
              emailVerified: true,
            }),
          );
          return this.issueTokenPair(
            manager,
            profile.tenantId,
            existingMerchantUser.id,
            existingMerchantUser.role,
            randomUUID(),
          );
        }
      }

      throw new CodedNotFoundException(
        ErrorCode.MERCHANT_ADMIN_NOT_FOUND,
        'No merchant admin account found for this email',
      );
    });
  }

  async refresh(
    tenantId: string,
    rawRefreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = hashRefreshToken(rawRefreshToken);

    return this.tenantDb.run(async (manager) => {
      const existing = await manager.findOne(MerchantUserRefreshToken, {
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
          MerchantUserRefreshToken,
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

      const merchantUser = await manager.findOne(MerchantUser, {
        where: { id: existing.merchantUserId },
      });
      if (!merchantUser) {
        throw new CodedUnauthorizedException(
          ErrorCode.MERCHANT_ADMIN_NO_LONGER_EXISTS,
          'Merchant user no longer exists',
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
        MerchantUserRefreshToken,
        { id: existing.id, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      if (!revokeResult.affected) {
        await manager.update(
          MerchantUserRefreshToken,
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
        merchantUser.id,
        merchantUser.role,
        existing.familyId,
      );
    });
  }

  async logout(tenantId: string, rawRefreshToken: string): Promise<void> {
    const tokenHash = hashRefreshToken(rawRefreshToken);
    await this.tenantDb.run(async (manager) => {
      const existing = await manager.findOne(MerchantUserRefreshToken, {
        where: { tokenHash },
      });
      if (existing && !existing.revokedAt) {
        await manager.update(
          MerchantUserRefreshToken,
          { familyId: existing.familyId },
          { revokedAt: new Date() },
        );
      }
    });
  }

  async requestPasswordReset(email: string): Promise<void> {
    // Token + hash are computed unconditionally, before we even know whether
    // `email` is registered, and every branch below performs the same shape
    // of DB round trips and always sends the same email. A response that's
    // identical in body but faster/cheaper on the "not registered" path
    // (fewer queries, no write, no outbound email) would still leak account
    // existence via timing/call-count even though nothing in the response
    // itself differs — mirrors CustomersAuthService.requestPasswordReset
    // (Task 15 review fix round 1).
    const resetToken = generateOpaqueToken();
    const resetTokenHash = createHash('sha256')
      .update(resetToken)
      .digest('hex');
    const resetTokenExpiresAt = new Date(
      Date.now() + AUTH_TOKEN_TTL_MS.PASSWORD_RESET,
    );

    await this.tenantDb.run(async (manager) => {
      const merchantUser = await manager.findOne(MerchantUser, {
        where: { email },
      });
      const identity = await manager.findOne(MerchantUserIdentity, {
        where: {
          merchantUserId: merchantUser?.id ?? NON_EXISTENT_ID,
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
        MerchantUserIdentity,
        { id: identity?.id ?? NON_EXISTENT_ID },
        {
          passwordResetTokenHash: resetTokenHash,
          passwordResetTokenExpiresAt: resetTokenExpiresAt,
        },
      );
    });

    // Sent after the transaction commits, not from inside tenantDb.run() —
    // same reasoning as register() above: a slow/failing notification
    // provider must not hold the MerchantUserIdentity row lock open or roll
    // back a reset token that was already persisted. Sent unconditionally
    // regardless of whether `email` matched a real account/identity, for the
    // same anti-enumeration reason as the DB work above.
    await this.notifications.sendEmail(email, 'password-reset', {
      token: resetToken,
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = createHash('sha256').update(token).digest('hex');

    await this.tenantDb.run(async (manager) => {
      const identity = await manager.findOne(MerchantUserIdentity, {
        where: { provider: 'password', passwordResetTokenHash: tokenHash },
      });
      if (
        !identity ||
        !identity.passwordResetTokenExpiresAt ||
        identity.passwordResetTokenExpiresAt < new Date()
      ) {
        throw new CodedNotFoundException(
          ErrorCode.MERCHANT_ADMIN_PASSWORD_RESET_TOKEN_INVALID,
          'Invalid or expired password reset token',
        );
      }

      identity.passwordHash = await this.hashing.hash(newPassword);
      identity.passwordResetTokenHash = null;
      identity.passwordResetTokenExpiresAt = null;
      await manager.save(MerchantUserIdentity, identity);

      // MUST invalidate all refresh tokens on reset (§3).
      await manager.update(
        MerchantUserRefreshToken,
        { merchantUserId: identity.merchantUserId },
        { revokedAt: new Date() },
      );
    });
  }

  private async issueTokenPair(
    manager: EntityManager,
    tenantId: string,
    merchantUserId: string,
    role: string,
    familyId: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const rawRefreshToken = generateOpaqueRefreshToken();

    // tenant_id is a NOT NULL composite-PK column on
    // MerchantUserRefreshToken (ImmutableTenantEntityBase), enforced by an
    // RLS WITH CHECK policy — must be stamped explicitly, same as
    // MerchantUser/MerchantUserIdentity in register() above.
    await manager.save(
      manager.create(MerchantUserRefreshToken, {
        tenantId,
        merchantUserId,
        tokenHash: hashRefreshToken(rawRefreshToken),
        familyId,
        expiresAt: new Date(Date.now() + AUTH_TOKEN_TTL_MS.REFRESH_TOKEN),
        revokedAt: null,
      }),
    );

    const accessToken = this.tokenService.signAccessToken({
      sub: merchantUserId,
      aud: 'merchant_admin',
      tenantId,
      role,
    });
    return { accessToken, refreshToken: rawRefreshToken };
  }
}
