import { BadRequestException, Injectable } from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export interface OAuthState {
  population: 'customer' | 'merchant_admin';
  tenantId: string;
  returnUrl: string;
  intent: 'login' | 'link';
  linkCustomerId?: string;
  nonce: string;
}

@Injectable()
export class OAuthStateService {
  private readonly secret: string;

  constructor() {
    const secret = process.env.OAUTH_STATE_SECRET;
    if (!secret) {
      throw new Error('OAUTH_STATE_SECRET is not set');
    }
    this.secret = secret;
  }

  encode(state: Omit<OAuthState, 'nonce'>): string {
    const full: OAuthState = { ...state, nonce: randomUUID() };
    const payload = Buffer.from(JSON.stringify(full)).toString('base64url');
    return `${payload}.${this.sign(payload)}`;
  }

  decode(token: string): OAuthState {
    const [payload, signature] = token.split('.');
    if (!payload || !signature || !this.isValidSignature(payload, signature)) {
      throw new BadRequestException('Invalid OAuth state');
    }
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as OAuthState;
  }

  private isValidSignature(payload: string, signature: string): boolean {
    const expected = Buffer.from(this.sign(payload));
    const actual = Buffer.from(signature);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('base64url');
  }
}
