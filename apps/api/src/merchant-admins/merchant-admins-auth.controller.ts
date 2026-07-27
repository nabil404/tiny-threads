import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ClsService } from 'nestjs-cls';
import type { Request, Response } from 'express';
import { OAuthStateService } from '../auth-core/oauth-state.service';
import { OneTimeCodeService } from '../oauth/one-time-code.service';
import { MerchantAdminsAuthService } from './merchant-admins-auth.service';
import { RegisterMerchantUserDto } from './dto/register-merchant-user.dto';
import { VerifyMerchantUserEmailDto } from './dto/verify-merchant-user-email.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { RequestMerchantUserPasswordResetDto } from './dto/request-merchant-user-password-reset.dto';
import { ResetMerchantUserPasswordDto } from './dto/reset-merchant-user-password.dto';
import { MerchantAdminOAuthExchangeDto } from './dto/merchant-admin-oauth-exchange.dto';
import { MerchantAdminJwtAuthGuard } from './merchant-admin-jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';
import type { MerchantAdminAccessTokenPayload } from '../auth-core/token.service';

const REFRESH_COOKIE_NAME = 'merchant_admin_refresh_token';
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/merchant-admins/auth',
};

@Controller('merchant-admins/auth')
export class MerchantAdminsAuthController {
  constructor(
    private readonly merchantAdminsAuthService: MerchantAdminsAuthService,
    private readonly cls: ClsService,
    private readonly oauthState: OAuthStateService,
    private readonly oneTimeCodeService: OneTimeCodeService,
  ) {}

  @Post('register')
  register(@Body() dto: RegisterMerchantUserDto) {
    return this.merchantAdminsAuthService.register(dto);
  }

  @Post('verify-email')
  @HttpCode(200)
  verifyEmail(@Body() dto: VerifyMerchantUserEmailDto) {
    return this.merchantAdminsAuthService.verifyEmail(dto);
  }

  // Only existing owners/admins can invite new members — this is now the
  // ONLY path by which a role gets granted (register() derives email/role
  // from the invite it redeems, never from client input). MerchantAdminJwtAuthGuard
  // authenticates the caller; RolesGuard + @Roles enforces the caller
  // already holds one of these roles for this tenant. RolesGuard alone
  // doesn't stop an 'admin' from inviting someone in as 'owner' though —
  // that's enforced by inviteMember() itself via the caller's own role
  // (invitedByRole), passed through here from the verified JWT.
  @UseGuards(MerchantAdminJwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Post('invite')
  @HttpCode(200)
  async invite(@Req() req: Request, @Body() dto: InviteMemberDto) {
    const {
      sub: invitedByMerchantUserId,
      tenantId,
      role: invitedByRole,
    } = req.user as MerchantAdminAccessTokenPayload;
    await this.merchantAdminsAuthService.inviteMember({
      tenantId,
      invitedByMerchantUserId,
      invitedByRole,
      email: dto.email,
      role: dto.role,
    });
    return { success: true };
  }

  @UseGuards(AuthGuard('merchant-admin-local'))
  @Post('login')
  login(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken } = req.user as {
      accessToken: string;
      refreshToken: string;
    };
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);
    return { accessToken };
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // tenantId is resolved from CLS (set by TenantResolutionMiddleware from
    // the subdomain), not from client input — the refresh cookie alone
    // doesn't carry a tenant, and trusting a client-supplied body field here
    // would let a caller point a stolen/guessed refresh token lookup at a
    // different tenant than the one that actually issued it.
    const tenantId = this.cls.get<string>('tenantId');
    const rawRefreshToken = (
      req.cookies as Record<string, string> | undefined
    )?.[REFRESH_COOKIE_NAME];
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }
    const result = await this.merchantAdminsAuthService.refresh(
      tenantId,
      rawRefreshToken,
    );
    res.cookie(
      REFRESH_COOKIE_NAME,
      result.refreshToken,
      REFRESH_COOKIE_OPTIONS,
    );
    return { accessToken: result.accessToken };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const tenantId = this.cls.get<string>('tenantId');
    const rawRefreshToken = (
      req.cookies as Record<string, string> | undefined
    )?.[REFRESH_COOKIE_NAME];
    if (rawRefreshToken) {
      await this.merchantAdminsAuthService.logout(tenantId, rawRefreshToken);
    }
    res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_OPTIONS.path });
    return { success: true };
  }

  @Post('request-password-reset')
  @HttpCode(200)
  requestPasswordReset(@Body() dto: RequestMerchantUserPasswordResetDto) {
    return this.merchantAdminsAuthService.requestPasswordReset(dto.email);
  }

  @Post('reset-password')
  @HttpCode(200)
  resetPassword(@Body() dto: ResetMerchantUserPasswordDto) {
    return this.merchantAdminsAuthService.resetPassword(
      dto.token,
      dto.password,
    );
  }

  // Merchant admins don't self-register via OAuth (see
  // MerchantAdminsAuthService.findOrCreateFromGoogle), so there's no
  // link-initiate counterpart here — just login.
  @Post('google/initiate')
  initiateGoogle(@Body('returnUrl') returnUrl: string) {
    const tenantId = this.cls.get<string>('tenantId');
    const state = this.oauthState.encode({
      population: 'merchant_admin',
      tenantId,
      returnUrl,
      intent: 'login',
    });
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      redirect_uri: `${process.env.PLATFORM_BASE_URL}/auth/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      state,
    });
    return {
      redirectUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    };
  }

  // Exchanges the short-lived, single-use one-time code minted by
  // GoogleOAuthController's callback for the real token pair — mirrors
  // CustomersAuthController#exchangeGoogleCode exactly (see there for the
  // full rationale on why tokens travel via this code rather than the
  // redirect URL itself).
  @Post('google/exchange')
  @HttpCode(200)
  exchangeGoogleCode(
    @Body() dto: MerchantAdminOAuthExchangeDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const payload = this.oneTimeCodeService.redeem(dto.code);
    // This route IS behind TenantResolutionMiddleware (unlike the Google
    // callback), so the redeeming request's own tenant is available in CLS.
    // A code is only honored if it was minted for THIS tenant — otherwise,
    // within its 60s TTL, a code obtained on one tenant's domain could be
    // redeemed against a different tenant's exchange endpoint.
    const tenantId = this.cls.get<string>('tenantId');
    if (
      !payload ||
      payload.population !== 'merchant_admin' ||
      payload.tenantId !== tenantId
    ) {
      throw new BadRequestException('Invalid or expired code');
    }
    res.cookie(
      REFRESH_COOKIE_NAME,
      payload.refreshToken,
      REFRESH_COOKIE_OPTIONS,
    );
    return { accessToken: payload.accessToken };
  }
}
