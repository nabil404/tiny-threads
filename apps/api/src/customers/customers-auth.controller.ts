import {
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
import { CustomersAuthService } from './customers-auth.service';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import { VerifyCustomerEmailDto } from './dto/verify-customer-email.dto';

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
}
