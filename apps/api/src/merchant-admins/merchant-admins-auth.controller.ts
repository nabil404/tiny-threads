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
import { MerchantAdminsAuthService } from './merchant-admins-auth.service';
import { RegisterMerchantUserDto } from './dto/register-merchant-user.dto';
import { VerifyMerchantUserEmailDto } from './dto/verify-merchant-user-email.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
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
  // already holds one of these roles for this tenant.
  @UseGuards(MerchantAdminJwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Post('invite')
  @HttpCode(200)
  async invite(@Req() req: Request, @Body() dto: InviteMemberDto) {
    const { sub: invitedByMerchantUserId, tenantId } =
      req.user as MerchantAdminAccessTokenPayload;
    await this.merchantAdminsAuthService.inviteMember({
      tenantId,
      invitedByMerchantUserId,
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
}
