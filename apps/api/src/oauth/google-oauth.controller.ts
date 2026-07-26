import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { ClsService } from 'nestjs-cls';
import { OAuthStateService } from '../auth-core/oauth-state.service';
import { CustomersAuthService } from '../customers/customers-auth.service';
import { OneTimeCodeService } from './one-time-code.service';

// Single centralized callback registered once in Google Cloud Console —
// tenant subdomains/custom domains can't be registered individually with
// Google, so every population's OAuth flow routes through here and is then
// redirected back to the originating tenant domain.
@Controller('auth/google')
export class GoogleOAuthController {
  private readonly client = new OAuth2Client(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    `${process.env.PLATFORM_BASE_URL}/auth/google/callback`,
  );

  constructor(
    private readonly oauthState: OAuthStateService,
    private readonly customersAuthService: CustomersAuthService,
    private readonly oneTimeCodeService: OneTimeCodeService,
    private readonly cls: ClsService,
  ) {}

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') stateToken: string,
    @Res() res: Response,
  ) {
    const state = this.oauthState.decode(stateToken);
    // This route is deliberately excluded from TenantResolutionMiddleware
    // (it's a platform-domain route, not a per-tenant subdomain — Google
    // can't be registered with one callback per tenant), so nothing else
    // populates CLS here. TenantDbService.run()/withTenant() read the
    // tenant EXCLUSIVELY from CLS and throw if it's unset, so this must be
    // set from the verified state before any call that touches the
    // database (findOrCreateFromGoogle/linkGoogleIdentity below).
    this.cls.set('tenantId', state.tenantId);
    const { tokens } = await this.client.getToken(code);
    if (!tokens.id_token) {
      throw new BadRequestException('Google did not return an id_token');
    }
    const ticket = await this.client.verifyIdToken({
      idToken: tokens.id_token,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) {
      throw new BadRequestException('Invalid Google id_token payload');
    }

    if (state.population === 'customer') {
      if (state.intent === 'link' && state.linkCustomerId) {
        await this.customersAuthService.linkGoogleIdentity({
          tenantId: state.tenantId,
          customerId: state.linkCustomerId,
          googleSub: payload.sub,
          email: payload.email,
        });
        // No tokens are minted by linking, so there's nothing sensitive to
        // hand off here — a plain redirect is fine.
        return res.redirect(`${state.returnUrl}?linked=true`);
      }

      const result = await this.customersAuthService.findOrCreateFromGoogle({
        tenantId: state.tenantId,
        googleSub: payload.sub,
        email: payload.email,
        emailVerified: Boolean(payload.email_verified),
      });
      if ('linkRequired' in result) {
        return res.redirect(`${state.returnUrl}?linkRequired=true`);
      }

      // Hand off via a short-lived, single-use one-time code rather than
      // putting the token pair in the URL — the tenant domain exchanges it
      // server-side for the real tokens (see
      // CustomersAuthController#exchangeGoogleCode).
      const oneTimeCode = this.oneTimeCodeService.issue({
        population: 'customer',
        tenantId: state.tenantId,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
      return res.redirect(
        `${state.returnUrl}?code=${encodeURIComponent(oneTimeCode)}`,
      );
    }

    // 'merchant_admin' population handled once Task 14 adds its branch here.
    throw new BadRequestException('Unsupported OAuth population');
  }
}
