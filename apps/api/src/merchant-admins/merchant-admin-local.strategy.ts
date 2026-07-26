import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { ClsService } from 'nestjs-cls';
import { MerchantAdminsAuthService } from './merchant-admins-auth.service';

@Injectable()
export class MerchantAdminLocalStrategy extends PassportStrategy(
  Strategy,
  'merchant-admin-local',
) {
  constructor(
    private readonly merchantAdminsAuthService: MerchantAdminsAuthService,
    private readonly cls: ClsService,
  ) {
    super({ usernameField: 'email' });
  }

  async validate(email: string, password: string) {
    const tenantId = this.cls.get<string>('tenantId');
    return this.merchantAdminsAuthService.login(tenantId, email, password);
  }
}
