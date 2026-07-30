import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ErrorCode } from '@tiny-threads/shared';
import { CodedUnauthorizedException } from '../../common/errors/coded-exceptions';
import { AccessTokenPayload } from '../../auth-core/services/token.service';
import { EnvironmentVariables } from '../../config/env.validation';

@Injectable()
export class MerchantAdminJwtStrategy extends PassportStrategy(
  Strategy,
  'merchant-admin-jwt',
) {
  constructor(
    private readonly cls: ClsService,
    configService: ConfigService<EnvironmentVariables, true>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get('JWT_SECRET', { infer: true }),
    });
  }

  validate(payload: AccessTokenPayload): AccessTokenPayload {
    if (payload.aud !== 'merchant_admin') {
      throw new CodedUnauthorizedException(
        ErrorCode.AUTH_WRONG_TOKEN_AUDIENCE,
        'Wrong token audience',
      );
    }
    // Every tenant shares one JWT signing secret, so a signature alone does
    // not say WHICH tenant a token belongs to. Without this check a token
    // minted on tenant A's subdomain is accepted verbatim when replayed
    // against tenant B's subdomain, and the request only fails later — as an
    // unhandled 500 from an RLS WITH CHECK violation — instead of a clean 401.
    // The CLS tenant is the one TenantResolutionMiddleware resolved from this
    // request's own host, so it is the authority here.
    if (payload.tenantId !== this.cls.get<string>('tenantId')) {
      throw new CodedUnauthorizedException(
        ErrorCode.AUTH_TOKEN_TENANT_MISMATCH,
        'Token tenant mismatch',
      );
    }
    return payload;
  }
}
