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
import { CustomersAuthService } from './customers-auth.service';
import { CustomerJwtAuthGuard } from './guards/customer-jwt-auth.guard';
import { CustomerLocalAuthGuard } from './guards/customer-local-auth.guard';
import { LoginCustomerDto } from './dto/login-customer.dto';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import { VerifyCustomerEmailDto } from './dto/verify-customer-email.dto';
import { CustomerOAuthInitiateDto } from './dto/customer-oauth-initiate.dto';
import { CustomerOAuthExchangeDto } from './dto/customer-oauth-exchange.dto';
import { RequestCustomerPasswordResetDto } from './dto/request-customer-password-reset.dto';
import { ResetCustomerPasswordDto } from './dto/reset-customer-password.dto';
import { EnvironmentVariables } from '../config/env.validation';
import {
  API_ROUTE_PREFIX,
  AUTH_ACCESS_COOKIE_OPTIONS,
  AUTH_REFRESH_COOKIE_OPTIONS,
} from '../common/constants';

const ACCESS_COOKIE_NAME = 'customer_access_token';
const ACCESS_COOKIE_PATH = '/';
const REFRESH_COOKIE_NAME = 'customer_refresh_token';
const REFRESH_COOKIE_PATH = `${API_ROUTE_PREFIX}/customers/auth`;

@ApiTags('Customers Auth')
@Controller('customers/auth')
export class CustomersAuthController {
  constructor(
    private readonly customersAuthService: CustomersAuthService,
    private readonly cls: ClsService,
    private readonly oauthState: OAuthStateService,
    private readonly oneTimeCodeService: OneTimeCodeService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  @ApiOperation({
    summary: 'Register a customer',
    description:
      'Creates a customer account for the current tenant and sends a verification email.',
  })
  @Post('register')
  register(@Body() dto: RegisterCustomerDto) {
    return this.customersAuthService.register(dto);
  }

  @ApiOperation({
    summary: 'Verify customer email',
    description:
      "Confirms a customer's email address using the token sent at registration.",
  })
  @Post('verify-email')
  @HttpCode(200)
  verifyEmail(@Body() dto: VerifyCustomerEmailDto) {
    return this.customersAuthService.verifyEmail(dto);
  }

  @ApiOperation({
    summary: 'Get authenticated customer profile',
    description:
      'Returns the current authenticated customer identity from the verified session.',
  })
  @ApiBearerAuth()
  @UseGuards(CustomerJwtAuthGuard)
  @Get('me')
  getMe(@Req() req: Request) {
    const user = req.user as { sub: string; tenantId: string };
    return this.customersAuthService.getMe(user.sub);
  }

  @ApiOperation({
    summary: 'Log in a customer',
    description:
      'Authenticates a customer by email/password, sets cookies, and returns an access token.',
  })
  @ApiBody({ type: LoginCustomerDto })
  @UseGuards(CustomerLocalAuthGuard)
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
    summary: 'Refresh customer access token',
    description:
      'Rotates the refresh token cookie and issues a new access token and cookie.',
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
    const result = await this.customersAuthService.refresh(
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
    summary: 'Log out a customer',
    description:
      "Revokes the customer's refresh token and clears both access and refresh cookies.",
  })
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const tenantId = this.cls.get<string>('tenantId');
    const rawRefreshToken = (
      req.cookies as Record<string, string> | undefined
    )?.[REFRESH_COOKIE_NAME];
    if (rawRefreshToken) {
      await this.customersAuthService.logout(tenantId, rawRefreshToken);
    }
    res.clearCookie(ACCESS_COOKIE_NAME, { path: ACCESS_COOKIE_PATH });
    res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
    return { success: true };
  }

  @ApiOperation({
    summary: 'Request a customer password reset',
    description:
      'Sends a password reset email if an account exists for the given address.',
  })
  @Post('request-password-reset')
  @HttpCode(200)
  requestPasswordReset(@Body() dto: RequestCustomerPasswordResetDto) {
    return this.customersAuthService.requestPasswordReset(dto.email);
  }

  @ApiOperation({
    summary: 'Reset customer password',
    description: 'Sets a new password using a valid password reset token.',
  })
  @Post('reset-password')
  @HttpCode(200)
  resetPassword(@Body() dto: ResetCustomerPasswordDto) {
    return this.customersAuthService.resetPassword(dto.token, dto.password);
  }

  @ApiOperation({
    summary: 'Start customer Google sign-in',
    description:
      'Returns the Google OAuth authorization URL to sign in or sign up a customer.',
  })
  @Post('google/initiate')
  initiateGoogle(@Req() req: Request, @Body() dto: CustomerOAuthInitiateDto) {
    assertReturnUrlMatchesRequestHost(dto.returnUrl, req);
    const tenantId = this.cls.get<string>('tenantId');
    const state = this.oauthState.encode({
      population: 'customer',
      tenantId,
      returnUrl: dto.returnUrl,
      intent: 'login',
    });
    return { redirectUrl: this.googleAuthorizeUrl(state) };
  }

  @ApiOperation({
    summary: 'Start linking Google to a customer account',
    description:
      'Returns the Google OAuth authorization URL to link a Google identity to the authenticated customer.',
  })
  @ApiBearerAuth()
  @UseGuards(CustomerJwtAuthGuard)
  @Post('google/link/initiate')
  initiateGoogleLink(
    @Req() req: Request,
    @Body() dto: CustomerOAuthInitiateDto,
  ) {
    assertReturnUrlMatchesRequestHost(dto.returnUrl, req);
    const { sub: customerId, tenantId } = req.user as {
      sub: string;
      tenantId: string;
    };
    const state = this.oauthState.encode({
      population: 'customer',
      tenantId,
      returnUrl: dto.returnUrl,
      intent: 'link',
      linkCustomerId: customerId,
    });
    return { redirectUrl: this.googleAuthorizeUrl(state) };
  }

  @ApiOperation({
    summary: 'Exchange Google one-time code',
    description:
      "Redeems the one-time code from the Google callback for the customer's access token and sets the cookies.",
  })
  @Post('google/exchange')
  @HttpCode(200)
  exchangeGoogleCode(
    @Body() dto: CustomerOAuthExchangeDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const payload = this.oneTimeCodeService.redeem(dto.code);
    const tenantId = this.cls.get<string>('tenantId');
    if (
      !payload ||
      payload.population !== 'customer' ||
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

  private googleAuthorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.configService.get('GOOGLE_OAUTH_CLIENT_ID', {
        infer: true,
      }),
      redirect_uri: `${this.configService.get('PLATFORM_BASE_URL', { infer: true })}/auth/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }
}
