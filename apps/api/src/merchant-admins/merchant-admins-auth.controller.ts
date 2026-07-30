import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import type { Request, Response } from 'express';
import { ErrorCode } from '@tiny-threads/shared';
import {
  CodedBadRequestException,
  CodedUnauthorizedException,
} from '../common/errors/coded-exceptions';
import { OAuthStateService } from '../auth-core/services/oauth-state.service';
import { assertReturnUrlMatchesRequestHost } from '../common/utils/return-url';
import { OneTimeCodeService } from '../oauth/one-time-code.service';
import { MerchantAdminsAuthService } from './merchant-admins-auth.service';
import { LoginMerchantUserDto } from './dto/login-merchant-user.dto';
import { RegisterMerchantUserDto } from './dto/register-merchant-user.dto';
import { VerifyMerchantUserEmailDto } from './dto/verify-merchant-user-email.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { RequestMerchantUserPasswordResetDto } from './dto/request-merchant-user-password-reset.dto';
import { ResetMerchantUserPasswordDto } from './dto/reset-merchant-user-password.dto';
import { MerchantAdminOAuthExchangeDto } from './dto/merchant-admin-oauth-exchange.dto';
import { MerchantAdminOAuthInitiateDto } from './dto/merchant-admin-oauth-initiate.dto';
import { MerchantAdminJwtAuthGuard } from './guards/merchant-admin-jwt-auth.guard';
import { MerchantAdminLocalAuthGuard } from './guards/merchant-admin-local-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import type { MerchantAdminAccessTokenPayload } from '../auth-core/services/token.service';
import { EnvironmentVariables } from '../config/env.validation';
import {
  API_ROUTE_PREFIX,
  AUTH_REFRESH_COOKIE_OPTIONS,
} from '../common/constants';

const REFRESH_COOKIE_NAME = 'merchant_admin_refresh_token';
const REFRESH_COOKIE_PATH = `${API_ROUTE_PREFIX}/merchant-admins/auth`;

@ApiTags('Merchant Admins Auth')
@Controller('merchant-admins/auth')
export class MerchantAdminsAuthController {
  constructor(
    private readonly merchantAdminsAuthService: MerchantAdminsAuthService,
    private readonly cls: ClsService,
    private readonly oauthState: OAuthStateService,
    private readonly oneTimeCodeService: OneTimeCodeService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  @ApiOperation({
    summary: 'Register a merchant admin',
    description:
      'Creates a merchant admin account by redeeming an invite and sends a verification email.',
  })
  @Post('register')
  register(@Body() dto: RegisterMerchantUserDto) {
    return this.merchantAdminsAuthService.register(dto);
  }

  @ApiOperation({
    summary: 'Verify merchant admin email',
    description:
      "Confirms a merchant admin's email address using the token sent at registration.",
  })
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
  @ApiOperation({
    summary: 'Invite a merchant admin member',
    description:
      'Invites a new member to the tenant with a given role; only existing owners/admins may call this.',
  })
  @ApiBearerAuth()
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

  @ApiOperation({
    summary: 'Log in a merchant admin',
    description:
      'Authenticates a merchant admin by email/password, returns an access token, and sets a refresh token cookie.',
  })
  @ApiBody({ type: LoginMerchantUserDto })
  @UseGuards(MerchantAdminLocalAuthGuard)
  @Post('login')
  login(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken } = req.user as {
      accessToken: string;
      refreshToken: string;
    };
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      ...AUTH_REFRESH_COOKIE_OPTIONS,
      path: REFRESH_COOKIE_PATH,
    });
    return { accessToken };
  }

  @ApiOperation({
    summary: 'Refresh merchant admin access token',
    description:
      'Rotates the refresh token cookie and issues a new access token.',
  })
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
      throw new CodedUnauthorizedException(
        ErrorCode.AUTH_MISSING_REFRESH_TOKEN,
        'Missing refresh token',
      );
    }
    const result = await this.merchantAdminsAuthService.refresh(
      tenantId,
      rawRefreshToken,
    );
    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, {
      ...AUTH_REFRESH_COOKIE_OPTIONS,
      path: REFRESH_COOKIE_PATH,
    });
    return { accessToken: result.accessToken };
  }

  @ApiOperation({
    summary: 'Log out a merchant admin',
    description:
      "Revokes the merchant admin's refresh token and clears the refresh token cookie.",
  })
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
    res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
    return { success: true };
  }

  @ApiOperation({
    summary: 'Request a merchant admin password reset',
    description:
      'Sends a password reset email if an account exists for the given address.',
  })
  @Post('request-password-reset')
  @HttpCode(200)
  requestPasswordReset(@Body() dto: RequestMerchantUserPasswordResetDto) {
    return this.merchantAdminsAuthService.requestPasswordReset(dto.email);
  }

  @ApiOperation({
    summary: 'Reset merchant admin password',
    description: 'Sets a new password using a valid password reset token.',
  })
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
  @ApiOperation({
    summary: 'Start merchant admin Google sign-in',
    description:
      'Returns the Google OAuth authorization URL to sign in a merchant admin.',
  })
  @Post('google/initiate')
  initiateGoogle(
    @Req() req: Request,
    @Body() dto: MerchantAdminOAuthInitiateDto,
  ) {
    // This endpoint is unauthenticated and the returnUrl it accepts is where
    // the callback later delivers a token-bearing one-time code — so it must
    // be pinned to this request's own (tenant-validated) host, or it's an open
    // redirect that hands victim sessions to an attacker. See return-url.ts.
    assertReturnUrlMatchesRequestHost(dto.returnUrl, req);
    const tenantId = this.cls.get<string>('tenantId');
    const state = this.oauthState.encode({
      population: 'merchant_admin',
      tenantId,
      returnUrl: dto.returnUrl,
      intent: 'login',
    });
    const params = new URLSearchParams({
      client_id: this.configService.get('GOOGLE_OAUTH_CLIENT_ID', {
        infer: true,
      }),
      redirect_uri: `${this.configService.get('PLATFORM_BASE_URL', { infer: true })}/auth/google/callback`,
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
  @ApiOperation({
    summary: 'Exchange Google one-time code',
    description:
      "Redeems the one-time code from the Google callback for the merchant admin's access token and sets the refresh token cookie.",
  })
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
      throw new CodedBadRequestException(
        ErrorCode.OAUTH_INVALID_OR_EXPIRED_CODE,
        'Invalid or expired code',
      );
    }
    res.cookie(REFRESH_COOKIE_NAME, payload.refreshToken, {
      ...AUTH_REFRESH_COOKIE_OPTIONS,
      path: REFRESH_COOKIE_PATH,
    });
    return { accessToken: payload.accessToken };
  }
}
