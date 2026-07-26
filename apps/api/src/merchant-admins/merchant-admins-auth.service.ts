import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ClsService } from 'nestjs-cls';
import { IsNull } from 'typeorm';
import type { EntityManager } from 'typeorm';
import {
  MerchantUser,
  MerchantUserIdentity,
  MerchantUserRefreshToken,
} from '../db/entities';
import { TenantDbService } from '../db/tenant-db.service';
import { HashingService } from '../auth-core/hashing.service';
import { NOTIFICATIONS_PORT } from '../auth-core/notifications/notifications-port';
import type { NotificationsPort } from '../auth-core/notifications/notifications-port';
import { TokenService } from '../auth-core/token.service';
import {
  generateOpaqueRefreshToken,
  hashRefreshToken,
} from '../auth-core/refresh-token-crypto';
import { RegisterMerchantUserDto } from './dto/register-merchant-user.dto';
import { VerifyMerchantUserEmailDto } from './dto/verify-merchant-user-email.dto';

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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

  async register(
    dto: RegisterMerchantUserDto,
  ): Promise<{ merchantUserId: string }> {
    // tenant_id is a NOT NULL composite-PK column on both MerchantUser and
    // MerchantUserIdentity, enforced by an RLS WITH CHECK policy — nothing
    // populates it automatically on insert, so it must be read from CLS
    // (set by TenantResolutionMiddleware) and stamped explicitly, same as
    // CustomersAuthService.register().
    const tenantId = this.cls.get<string>('tenantId');

    const { merchantUserId, verificationToken } = await this.tenantDb.run(
      async (manager) => {
        const existing = await manager.findOne(MerchantUser, {
          where: { email: dto.email },
        });
        if (existing) {
          throw new ConflictException('Email already registered');
        }

        const merchantUser = await manager.save(
          manager.create(MerchantUser, {
            tenantId,
            email: dto.email,
            role: dto.role,
          }),
        );

        const passwordHash = await this.hashing.hash(dto.password);
        const verificationToken = randomBytes(32).toString('base64url');
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
              Date.now() + VERIFICATION_TOKEN_TTL_MS,
            ),
          }),
        );

        return { merchantUserId: merchantUser.id, verificationToken };
      },
    );

    // Sent after the transaction commits, not from inside tenantDb.run() —
    // a slow/failing notification provider must not roll back a successful
    // registration.
    await this.notifications.sendEmail(dto.email, 'verification-email', {
      token: verificationToken,
    });

    return { merchantUserId };
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
        throw new NotFoundException('Invalid or expired verification token');
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
        throw new UnauthorizedException('Invalid email or password');
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
        throw new UnauthorizedException('Invalid refresh token');
      }
      if (existing.revokedAt) {
        // Reuse of a revoked token in this family is a theft signal: revoke
        // the whole family.
        await manager.update(
          MerchantUserRefreshToken,
          { familyId: existing.familyId },
          { revokedAt: new Date() },
        );
        throw new UnauthorizedException('Refresh token reuse detected');
      }
      if (existing.expiresAt < new Date()) {
        throw new UnauthorizedException('Refresh token expired');
      }

      const merchantUser = await manager.findOne(MerchantUser, {
        where: { id: existing.merchantUserId },
      });
      if (!merchantUser) {
        throw new UnauthorizedException('Merchant user no longer exists');
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
        throw new UnauthorizedException('Refresh token reuse detected');
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
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
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
