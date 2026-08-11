import {
  Body,
  Controller,
  Get,
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
  AUTH_ACCESS_COOKIE_OPTIONS,
  AUTH_REFRESH_COOKIE_OPTIONS,
} from '../common/constants';

const ACCESS_COOKIE_NAME = 'merchant_admin_access_token';
const ACCESS_COOKIE_PATH = '/';
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
    summary: 'Get authenticated merchant admin profile',
    description:
      'Returns the current authenticated merchant admin identity from the verified session.',
  })
  @ApiBearerAuth()
  @UseGuards(MerchantAdminJwtAuthGuard)
  @Get('me')
  getMe(@Req() req: Request) {
    const user = req.user as MerchantAdminAccessTokenPayload;
    return {
      user: {
        id: user.sub,
        role: user.role,
        tenantId: user.tenantId,
      },
    };
  }

  @ApiOperation({
    summary: 'Log in a merchant admin',
    description:
      'Authenticates a merchant admin by email/password, sets access and refresh cookies, and returns an access token.',
  })
  @ApiBody({ type: LoginMerchantUserDto })
  @UseGuards(MerchantAdminLocalAuthGuard)
  @Post('login')
  login(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken } = req.user as {
      accessToken: string;
      refreshToken: string;
    };
    res.cookie(ACCESS_COOKIE_NAME, accessToken, {
      ...AUTH_ACCESS_COOKIE_OPTIONS,
      path: ACCESS_COOKIE_PATH,
    });
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      ...AUTH_REFRESH_COOKIE_OPTIONS,
      path: REFRESH_COOKIE_PATH,
    });
    return { accessToken };
  }

  @ApiOperation({
    summary: 'Refresh merchant admin access token',
    description:
      'Rotates the refresh token cookie and issues a new access token and access cookie.',
  })
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
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
    res.cookie(ACCESS_COOKIE_NAME, result.accessToken, {
      ...AUTH_ACCESS_COOKIE_OPTIONS,
      path: ACCESS_COOKIE_PATH,
    });
    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, {
      ...AUTH_REFRESH_COOKIE_OPTIONS,
      path: REFRESH_COOKIE_PATH,
    });
    return { accessToken: result.accessToken };
  }

  @ApiOperation({
    summary: 'Log out a merchant admin',
    description:
      "Revokes the merchant admin's refresh token and clears both access and refresh cookies.",
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
    res.clearCookie(ACCESS_COOKIE_NAME, { path: ACCESS_COOKIE_PATH });
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

  @ApiOperation({
    summary: 'Exchange Google one-time code',
    description:
      "Redeems the one-time code from the Google callback for the merchant admin's access token and sets the cookies.",
  })
  @Post('google/exchange')
  @HttpCode(200)
  exchangeGoogleCode(
    @Body() dto: MerchantAdminOAuthExchangeDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const payload = this.oneTimeCodeService.redeem(dto.code);
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
    res.cookie(ACCESS_COOKIE_NAME, payload.accessToken, {
      ...AUTH_ACCESS_COOKIE_OPTIONS,
      path: ACCESS_COOKIE_PATH,
    });
    res.cookie(REFRESH_COOKIE_NAME, payload.refreshToken, {
      ...AUTH_REFRESH_COOKIE_OPTIONS,
      path: REFRESH_COOKIE_PATH,
    });
    return { accessToken: payload.accessToken };
  }
}
