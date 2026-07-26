import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AccessTokenPayload } from '../auth-core/token.service';

@Injectable()
export class MerchantAdminJwtStrategy extends PassportStrategy(
  Strategy,
  'merchant-admin-jwt',
) {
  constructor() {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET is not set');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: secret,
    });
  }

  validate(payload: AccessTokenPayload): AccessTokenPayload {
    if (payload.aud !== 'merchant_admin') {
      throw new UnauthorizedException('Wrong token audience');
    }
    return payload;
  }
}
