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
import { CustomersAuthService } from './customers-auth.service';
import { CustomerJwtAuthGuard } from './customer-jwt-auth.guard';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import { VerifyCustomerEmailDto } from './dto/verify-customer-email.dto';
import { CustomerOAuthInitiateDto } from './dto/customer-oauth-initiate.dto';
import { CustomerOAuthExchangeDto } from './dto/customer-oauth-exchange.dto';

const REFRESH_COOKIE_NAME = 'customer_refresh_token';
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/customers/auth',
};

@Controller('customers/auth')
export class CustomersAuthController {
  constructor(
    private readonly customersAuthService: CustomersAuthService,
    private readonly cls: ClsService,
    private readonly oauthState: OAuthStateService,
    private readonly oneTimeCodeService: OneTimeCodeService,
  ) {}

  @Post('register')
  register(@Body() dto: RegisterCustomerDto) {
    return this.customersAuthService.register(dto);
  }

  @Post('verify-email')
  @HttpCode(200)
  verifyEmail(@Body() dto: VerifyCustomerEmailDto) {
    return this.customersAuthService.verifyEmail(dto);
  }

  @UseGuards(AuthGuard('customer-local'))
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
    const result = await this.customersAuthService.refresh(
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
      await this.customersAuthService.logout(tenantId, rawRefreshToken);
    }
    res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_OPTIONS.path });
    return { success: true };
  }

  @Post('google/initiate')
  initiateGoogle(@Body() dto: CustomerOAuthInitiateDto) {
    const tenantId = this.cls.get<string>('tenantId');
    const state = this.oauthState.encode({
      population: 'customer',
      tenantId,
      returnUrl: dto.returnUrl,
      intent: 'login',
    });
    return { redirectUrl: this.googleAuthorizeUrl(state) };
  }

  @UseGuards(CustomerJwtAuthGuard)
  @Post('google/link/initiate')
  initiateGoogleLink(
    @Req() req: Request,
    @Body() dto: CustomerOAuthInitiateDto,
  ) {
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

  // Exchanges the short-lived, single-use one-time code minted by
  // GoogleOAuthController's callback for the real token pair — the code
  // itself is safe to pass through a redirect URL (query param) since it's
  // opaque, expires in 60s, and is deleted on first read; the tokens it
  // unlocks never travel through a URL.
  @Post('google/exchange')
  @HttpCode(200)
  exchangeGoogleCode(
    @Body() dto: CustomerOAuthExchangeDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const payload = this.oneTimeCodeService.redeem(dto.code);
    // This route IS behind TenantResolutionMiddleware (unlike the Google
    // callback), so the redeeming request's own tenant is available in CLS.
    // A code is only honored if it was minted for THIS tenant — otherwise,
    // within its 60s TTL, a code obtained on one tenant's domain (e.g. from
    // a shared browser, a leaked Referer, or a race between tabs) could be
    // redeemed against a different tenant's exchange endpoint.
    const tenantId = this.cls.get<string>('tenantId');
    if (
      !payload ||
      payload.population !== 'customer' ||
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

  private googleAuthorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      redirect_uri: `${process.env.PLATFORM_BASE_URL}/auth/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }
}
