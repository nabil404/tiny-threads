import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { ErrorCode } from '@tiny-threads/shared';
import { CodedBadRequestException } from '../../common/errors/coded-exceptions';
import { EnvironmentVariables } from '../../config/env.validation';
import { AuthPopulation } from '../../common/constants';

export interface OAuthState {
  population: AuthPopulation;
  tenantId: string;
  returnUrl: string;
  intent: 'login' | 'link';
  linkCustomerId?: string;
  nonce: string;
}

@Injectable()
export class OAuthStateService {
  private readonly secret: string;

  constructor(configService: ConfigService<EnvironmentVariables, true>) {
    this.secret = configService.get('OAUTH_STATE_SECRET', { infer: true });
  }

  encode(state: Omit<OAuthState, 'nonce'>): string {
    const full: OAuthState = { ...state, nonce: randomUUID() };
    const payload = Buffer.from(JSON.stringify(full)).toString('base64url');
    return `${payload}.${this.sign(payload)}`;
  }

  decode(token: string): OAuthState {
    const [payload, signature] = token.split('.');
    if (!payload || !signature || !this.isValidSignature(payload, signature)) {
      throw new CodedBadRequestException(
        ErrorCode.OAUTH_INVALID_STATE,
        'Invalid OAuth state',
      );
    }
    return JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as OAuthState;
  }

  private isValidSignature(payload: string, signature: string): boolean {
    const expected = Buffer.from(this.sign(payload));
    const actual = Buffer.from(signature);
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret)
      .update(payload)
      .digest('base64url');
  }
}
