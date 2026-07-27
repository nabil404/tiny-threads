import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface CustomerAccessTokenPayload {
  sub: string;
  aud: 'customer';
  tenantId: string;
}

export interface MerchantAdminAccessTokenPayload {
  sub: string;
  aud: 'merchant_admin';
  tenantId: string;
  role: string;
}

export type AccessTokenPayload =
  CustomerAccessTokenPayload | MerchantAdminAccessTokenPayload;

@Injectable()
export class TokenService {
  constructor(private readonly jwtService: JwtService) {}

  signAccessToken(payload: AccessTokenPayload): string {
    return this.jwtService.sign(payload, { expiresIn: '15m' });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    return this.jwtService.verify<AccessTokenPayload>(token);
  }
}
